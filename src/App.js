import React, { useState, useEffect, useMemo, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
} from "firebase/firestore";
import {
  Wallet,
  ReceiptText,
  PlusCircle,
  History,
  User,
  CheckCircle2,
  X,
  Trash2,
  Settings,
  Calculator,
  ArrowDownToLine,
  ArrowUpFromLine,
  Cloud,
  CloudOff,
  Undo2,
  AlertTriangle,
  Sparkles,
} from "lucide-react";

// ==========================================
// 🚀 快速設定區
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyAR1GzSueTAQvTTA0LfIYLfuOn9bBtrVDI",
  authDomain: "yilan-99e2b.firebaseapp.com",
  projectId: "yilan-99e2b",
  storageBucket: "yilan-99e2b.firebasestorage.app",
  messagingSenderId: "971422172769",
  appId: "1:971422172769:web:718c4a2aa464d7b10b4c20",
};

const appId = "ma-brothers-shared-fund-app";
const SHARED_LEDGER_NAME = "ma_brothers_ledger_v1";

const BROTHERS = {
  YING_KAI: {
    id: "YING_KAI",
    name: "大哥 英凱",
    color: "text-indigo-600",
    bg: "bg-indigo-100",
    iconBg: "bg-indigo-500",
  },
  PEI_YAO: {
    id: "PEI_YAO",
    name: "二哥 培堯",
    color: "text-emerald-600",
    bg: "bg-emerald-100",
    iconBg: "bg-emerald-500",
  },
  KUO_CHUN: {
    id: "KUO_CHUN",
    name: "老三 國郡",
    color: "text-amber-600",
    bg: "bg-amber-100",
    iconBg: "bg-amber-500",
  },
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export default function App() {
  // --- State ---
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState("connecting");
  const [systemData, setSystemData] = useState({
    fundBalance: 0,
    stats: {
      YING_KAI: { advance: 0, owes: 0 },
      PEI_YAO: { advance: 0, owes: 0 },
      KUO_CHUN: { advance: 0, owes: 0 },
    },
  });

  // UI States
  const [modals, setModals] = useState({
    addFund: false,
    addExpense: false,
    settle: { show: false, broId: null, type: null },
    targetCalc: false,
    settings: false,
  });
  const [undoTx, setUndoTx] = useState(null);

  // Form States
  const [form, setForm] = useState({
    amount: "",
    description: "",
    splitType: "TWO",
    paidBy: "FUND",
  });
  const [targetAmount, setTargetAmount] = useState("50000");
  const [settingsForm, setSettingsForm] = useState(null);
  const [isAmountTouched, setIsAmountTouched] = useState(false);
  const [autoFillHint, setAutoFillHint] = useState("");

  // --- Utils ---
  const formatMoney = (num) => "$" + Math.round(num).toLocaleString();
  const formatDate = (ts) => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(
      2,
      "0"
    )}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  // --- Firebase Auth ---
  useEffect(() => {
    signInAnonymously(auth).catch(() => setSyncStatus("error"));
    return onAuthStateChanged(auth, setUser);
  }, []);

  // --- Data Sync ---
  useEffect(() => {
    if (!user) return;
    const txRef = collection(
      db,
      "artifacts",
      appId,
      "public",
      "data",
      `${SHARED_LEDGER_NAME}_transactions`
    );
    const stateRef = doc(
      db,
      "artifacts",
      appId,
      "public",
      "data",
      `${SHARED_LEDGER_NAME}_state`,
      "main"
    );

    const unsubTx = onSnapshot(
      query(txRef, orderBy("timestamp", "desc")),
      (snap) => {
        setTransactions(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
        setSyncStatus("synced");
      }
    );

    const unsubState = onSnapshot(stateRef, (docSnap) => {
      if (docSnap.exists()) setSystemData(docSnap.data());
      else setDoc(stateRef, systemData);
      setIsLoaded(true);
    });

    return () => {
      unsubTx();
      unsubState();
    };
  }, [user]);

  // --- Auto-fill Logic ---
  useEffect(() => {
    if (!modals.addExpense || isAmountTouched || !form.description) {
      if (!form.description) setAutoFillHint("");
      return;
    }
    const cleanStr = (s) => s.replace(/[0-9月日\/\-.\s]/g, "");
    const kw = cleanStr(form.description);
    if (kw.length >= 2) {
      const match = transactions.find(
        (t) => t.type === "EXPENSE" && cleanStr(t.description).includes(kw)
      );
      if (match) {
        setForm((prev) => ({
          ...prev,
          amount: match.amount.toString(),
          splitType: match.splitType,
          paidBy: match.paidBy,
        }));
        setAutoFillHint(`自動帶入「${match.description}」的設定 ✨`);
      }
    }
  }, [form.description, modals.addExpense]);

  // --- Core Handlers ---
  const closeModals = () => {
    setModals({
      addFund: false,
      addExpense: false,
      settle: { show: false, broId: null, type: null },
      targetCalc: false,
      settings: false,
    });
    setForm({ amount: "", description: "", splitType: "TWO", paidBy: "FUND" });
    setIsAmountTouched(false);
    setAutoFillHint("");
    setUndoTx(null);
  };

  const commitUpdate = async (newTx, stateChanges) => {
    if (!user) return;
    setSyncStatus("connecting");
    try {
      const stateRef = doc(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        `${SHARED_LEDGER_NAME}_state`,
        "main"
      );
      const txRef = doc(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        `${SHARED_LEDGER_NAME}_transactions`,
        newTx.id
      );

      let nextState = JSON.parse(JSON.stringify(systemData));
      if (stateChanges.fundBalance)
        nextState.fundBalance += stateChanges.fundBalance;

      Object.keys(BROTHERS).forEach((broId) => {
        if (stateChanges[broId]) {
          if (stateChanges[broId].advance)
            nextState.stats[broId].advance += stateChanges[broId].advance;
          if (stateChanges[broId].owes)
            nextState.stats[broId].owes += stateChanges[broId].owes;
        }
      });

      await setDoc(txRef, newTx);
      await setDoc(stateRef, nextState);
      setSyncStatus("synced");
      closeModals();
    } catch (e) {
      setSyncStatus("error");
    }
  };

  const handleAddFund = (e) => {
    e.preventDefault();
    const val = parseFloat(form.amount);
    if (!val || val <= 0) return;
    commitUpdate(
      {
        id: Date.now().toString(),
        timestamp: Date.now(),
        type: "ADD_FUND",
        amount: val,
        description: form.description || "存入現金水庫",
        author: user.uid,
      },
      { fundBalance: val }
    );
  };

  const handleAddExpense = (e) => {
    e.preventDefault();
    const val = parseFloat(form.amount);
    if (!val || !form.description) return;

    let changes = { fundBalance: 0 };
    if (form.paidBy === "FUND") changes.fundBalance = -val;
    else changes[form.paidBy] = { advance: val };

    const divisor = form.splitType === "TWO" ? 2 : 3;
    const share = val / divisor;
    changes.YING_KAI = { ...changes.YING_KAI, owes: share };
    changes.PEI_YAO = { ...changes.PEI_YAO, owes: share };
    if (form.splitType === "THREE")
      changes.KUO_CHUN = { ...changes.KUO_CHUN, owes: share };

    commitUpdate(
      {
        id: Date.now().toString(),
        timestamp: Date.now(),
        type: "EXPENSE",
        amount: val,
        description: form.description,
        splitType: form.splitType,
        paidBy: form.paidBy,
        author: user.uid,
      },
      changes
    );
  };

  const executeUndo = async () => {
    if (!undoTx) return;
    setSyncStatus("connecting");
    try {
      const stateRef = doc(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        `${SHARED_LEDGER_NAME}_state`,
        "main"
      );
      let nextState = JSON.parse(JSON.stringify(systemData));

      if (undoTx.type === "ADD_FUND" || undoTx.type === "REPLENISH_FUND") {
        nextState.fundBalance -= undoTx.amount;
      } else if (undoTx.type === "EXPENSE") {
        if (undoTx.paidBy === "FUND") nextState.fundBalance += undoTx.amount;
        else nextState.stats[undoTx.paidBy].advance -= undoTx.amount;
        const share = undoTx.amount / (undoTx.splitType === "TWO" ? 2 : 3);
        nextState.stats.YING_KAI.owes -= share;
        nextState.stats.PEI_YAO.owes -= share;
        if (undoTx.splitType === "THREE")
          nextState.stats.KUO_CHUN.owes -= share;
      } else if (undoTx.type === "CLAIM_ADVANCE") {
        nextState.fundBalance += undoTx.amount;
        nextState.stats[undoTx.broId].advance += undoTx.amount;
      } else if (undoTx.type === "PAY_OWES") {
        nextState.fundBalance -= undoTx.amount;
        nextState.stats[undoTx.broId].owes += undoTx.amount;
      }

      await deleteDoc(
        doc(
          db,
          "artifacts",
          appId,
          "public",
          "data",
          `${SHARED_LEDGER_NAME}_transactions`,
          undoTx.id
        )
      );
      await setDoc(stateRef, nextState);
      setSyncStatus("synced");
      setUndoTx(null);
    } catch (e) {
      setSyncStatus("error");
    }
  };

  if (!isLoaded)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
        <div className="p-4 bg-white rounded-full shadow-sm animate-bounce">
          <Cloud className="w-8 h-8 text-indigo-500" />
        </div>
        <p className="font-bold text-slate-400 tracking-widest">
          同步數據中...
        </p>
      </div>
    );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-32">
      <style>{`::-webkit-scrollbar { display: none; }`}</style>

      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md sticky top-0 z-20 flex justify-between items-center p-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          {syncStatus === "synced" ? (
            <Cloud className="w-5 h-5 text-emerald-500" />
          ) : (
            <Cloud className="w-5 h-5 text-amber-500 animate-pulse" />
          )}
          <h1 className="text-xl font-black tracking-tight">馬家共用帳本</h1>
        </div>
        <button
          onClick={() => {
            setSettingsForm({ ...systemData });
            setModals((m) => ({ ...m, settings: true }));
          }}
          className="p-2 bg-slate-50 rounded-full"
        >
          <Settings className="w-5 h-5 text-slate-400" />
        </button>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-6">
        {/* Main Balance Card */}
        <section className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden active:scale-[0.98] transition-transform">
          <div className="relative z-10 space-y-4">
            <p className="text-slate-400 text-xs font-black tracking-[0.2em] uppercase flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />{" "}
              目前水庫總額
            </p>
            <h2
              className={`text-6xl font-black tracking-tighter ${
                systemData.fundBalance < 0 ? "text-rose-400" : "text-white"
              }`}
            >
              {formatMoney(systemData.fundBalance)}
            </h2>
            <button
              onClick={() => setModals((m) => ({ ...m, targetCalc: true }))}
              className="w-full bg-white/10 hover:bg-white/20 py-4 rounded-2xl font-bold flex justify-center items-center gap-2 border border-white/10"
            >
              <Calculator className="w-5 h-5 text-indigo-300" />{" "}
              大二哥算錢補水庫
            </button>
          </div>
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/20 blur-3xl rounded-full" />
        </section>

        {/* Brother Status Cards */}
        <div className="grid grid-cols-1 gap-4">
          {Object.entries(BROTHERS).map(([id, bro]) => (
            <div
              key={id}
              className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100"
            >
              <div className="flex justify-between items-center mb-5">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full ${bro.iconBg} flex items-center justify-center text-white shadow-inner`}
                  >
                    <User className="w-5 h-5" />
                  </div>
                  <span className="font-black text-slate-800">{bro.name}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100">
                  <p className="text-[10px] font-black text-rose-500 uppercase mb-1">
                    應付(欠款)
                  </p>
                  <p className="text-xl font-black text-rose-700">
                    {formatMoney(systemData.stats[id].owes)}
                  </p>
                  {systemData.stats[id].owes > 0 && (
                    <button
                      onClick={() =>
                        setModals((m) => ({
                          ...m,
                          settle: { show: true, broId: id, type: "OWES" },
                        }))
                      }
                      className="w-full bg-rose-600 text-white text-xs font-bold py-2 rounded-lg mt-3 active:scale-95 transition-transform"
                    >
                      補錢入庫
                    </button>
                  )}
                </div>
                <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                  <p className="text-[10px] font-black text-emerald-500 uppercase mb-1">
                    已墊付
                  </p>
                  <p className="text-xl font-black text-emerald-700">
                    {formatMoney(systemData.stats[id].advance)}
                  </p>
                  {systemData.stats[id].advance > 0 && (
                    <button
                      onClick={() =>
                        setModals((m) => ({
                          ...m,
                          settle: { show: true, broId: id, type: "ADVANCE" },
                        }))
                      }
                      className="w-full bg-emerald-600 text-white text-xs font-bold py-2 rounded-lg mt-3 active:scale-95 transition-transform"
                    >
                      水庫領回
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Transaction History */}
        <section className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-black flex items-center gap-2">
              <History className="w-5 h-5 text-slate-400" /> 歷史紀錄
            </h3>
            {transactions.length > 0 && (
              <button
                onClick={() => setUndoTx(transactions[0])}
                className="text-[10px] font-black bg-slate-800 text-white px-3 py-1.5 rounded-full flex items-center gap-1 active:scale-95 transition-transform"
              >
                <Undo2 className="w-3 h-3" /> 退回最新
              </button>
            )}
          </div>
          <div className="space-y-4">
            {transactions.length === 0 ? (
              <div className="text-center py-10 text-slate-300 font-bold">
                目前無紀錄
              </div>
            ) : (
              transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center gap-4 p-2 hover:bg-slate-50 rounded-xl transition-colors"
                >
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                      tx.type === "EXPENSE"
                        ? "bg-rose-100 text-rose-600"
                        : "bg-indigo-100 text-indigo-600"
                    }`}
                  >
                    {tx.type === "EXPENSE" ? (
                      <ReceiptText className="w-5 h-5" />
                    ) : (
                      <Wallet className="w-5 h-5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 truncate">
                      {tx.description}
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium">
                      {formatDate(tx.timestamp)} •{" "}
                      {tx.splitType === "TWO" ? "大二哥" : "三人"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`font-black ${
                        tx.type === "EXPENSE" || tx.type === "CLAIM_ADVANCE"
                          ? "text-rose-600"
                          : "text-emerald-600"
                      }`}
                    >
                      {tx.type === "EXPENSE" || tx.type === "CLAIM_ADVANCE"
                        ? "-"
                        : "+"}
                      {formatMoney(tx.amount)}
                    </p>
                    <button
                      onClick={() => setUndoTx(tx)}
                      className="text-slate-300 hover:text-rose-500"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      {/* Footer Actions */}
      <footer className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-xl border-t border-slate-100 z-30">
        <div className="max-w-md mx-auto flex gap-3">
          <button
            onClick={() => setModals((m) => ({ ...m, addExpense: true }))}
            className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-black py-4 rounded-2xl shadow-xl shadow-rose-200 flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            <PlusCircle className="w-6 h-6" /> 記一筆花費
          </button>
          <button
            onClick={() => setModals((m) => ({ ...m, addFund: true }))}
            className="w-16 bg-slate-100 rounded-2xl flex items-center justify-center active:scale-95 transition-transform border border-slate-200"
          >
            <ArrowUpFromLine className="w-6 h-6 text-slate-500" />
          </button>
        </div>
      </footer>

      {/* Modals Container (簡化管理) */}
      {modals.addExpense && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-end justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 space-y-6 shadow-2xl animate-in slide-in-from-bottom-10">
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-black">新增花費</h3>
              <button
                onClick={closeModals}
                className="p-2 bg-slate-50 rounded-full"
              >
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleAddExpense} className="space-y-6">
              <input
                autoFocus
                placeholder="花費項目"
                className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold focus:ring-2 focus:ring-rose-500"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                required
              />
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400">
                  $
                </span>
                <input
                  type="number"
                  placeholder="金額"
                  className="w-full p-4 pl-8 bg-slate-50 border-none rounded-2xl font-black text-2xl focus:ring-2 focus:ring-rose-500"
                  value={form.amount}
                  onChange={(e) => {
                    setForm({ ...form, amount: e.target.value });
                    setIsAmountTouched(true);
                  }}
                  required
                />
              </div>
              {autoFillHint && (
                <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600 text-[10px] font-bold flex items-center gap-2 animate-pulse">
                  <Sparkles className="w-4 h-4" /> {autoFillHint}
                </div>
              )}

              <div className="space-y-3">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  1. 分攤方式
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, splitType: "TWO" })}
                    className={`py-3 rounded-xl font-bold text-sm ${
                      form.splitType === "TWO"
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    大二哥
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, splitType: "THREE" })}
                    className={`py-3 rounded-xl font-bold text-sm ${
                      form.splitType === "THREE"
                        ? "bg-amber-500 text-white"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    三兄弟
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  2. 誰付款
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, paidBy: "FUND" })}
                    className={`col-span-2 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 ${
                      form.paidBy === "FUND"
                        ? "bg-slate-800 text-white"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    <Wallet className="w-4 h-4" /> 扣水庫
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, paidBy: "YING_KAI" })}
                    className={`py-3 rounded-xl font-bold text-sm ${
                      form.paidBy === "YING_KAI"
                        ? "bg-indigo-100 text-indigo-700 border border-indigo-200"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    大哥墊
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, paidBy: "PEI_YAO" })}
                    className={`py-3 rounded-xl font-bold text-sm ${
                      form.paidBy === "PEI_YAO"
                        ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    二哥墊
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={syncStatus !== "synced"}
                className="w-full bg-rose-600 text-white py-5 rounded-3xl font-black text-lg shadow-xl shadow-rose-200 active:scale-95 transition-transform"
              >
                確認新增
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Target Calculator Modal (算錢補水庫) */}
      {modals.targetCalc && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-end justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 space-y-6 shadow-2xl animate-in slide-in-from-bottom-10">
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-black">大二哥補錢計算機</h3>
              <button
                onClick={closeModals}
                className="p-2 bg-slate-50 rounded-full"
              >
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 tracking-widest uppercase ml-1">
                  目標補滿金額
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400">
                    $
                  </span>
                  <input
                    type="number"
                    className="w-full p-4 pl-8 bg-slate-50 border-none rounded-2xl font-black text-2xl focus:ring-2 focus:ring-indigo-500"
                    value={targetAmount}
                    onChange={(e) => setTargetAmount(e.target.value)}
                  />
                </div>
              </div>

              {(() => {
                const target = parseFloat(targetAmount) || 0;
                const diff = target - systemData.fundBalance;
                if (diff <= 0)
                  return (
                    <div className="p-6 bg-emerald-50 text-emerald-600 rounded-3xl font-black text-center">
                      🎉 目前水庫非常充足，不需補錢！
                    </div>
                  );
                const share = diff / 2;
                return (
                  <>
                    <div className="bg-indigo-50 p-6 rounded-[2rem] space-y-4 border border-indigo-100">
                      <div className="flex justify-between items-center">
                        <span className="text-indigo-900 font-bold">
                          總共需補足
                        </span>
                        <span className="text-2xl font-black text-indigo-600">
                          {formatMoney(diff)}
                        </span>
                      </div>
                      <div className="h-px bg-indigo-200" />
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center bg-white p-4 rounded-2xl shadow-sm">
                          <p className="text-[10px] font-black text-slate-400 uppercase mb-1">
                            大哥需補
                          </p>
                          <p className="text-xl font-black text-rose-600">
                            {formatMoney(share)}
                          </p>
                        </div>
                        <div className="text-center bg-white p-4 rounded-2xl shadow-sm">
                          <p className="text-[10px] font-black text-slate-400 uppercase mb-1">
                            二哥需補
                          </p>
                          <p className="text-xl font-black text-rose-600">
                            {formatMoney(share)}
                          </p>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        commitUpdate(
                          {
                            id: Date.now().toString(),
                            timestamp: Date.now(),
                            type: "REPLENISH_FUND",
                            amount: diff,
                            description: "大二哥平分補足水庫",
                            author: user.uid,
                          },
                          { fundBalance: diff }
                        )
                      }
                      className="w-full bg-indigo-600 text-white py-5 rounded-3xl font-black text-lg shadow-xl shadow-indigo-100 active:scale-95 transition-transform"
                    >
                      確認已存入現金
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Undo Confirmation */}
      {undoTx && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-xs rounded-[2rem] p-8 space-y-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center text-rose-600">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black">確定刪除紀錄？</h3>
              <p className="text-xs text-slate-400 font-bold leading-relaxed">
                這將會自動還原水庫餘額與個人帳務，像是從未發生過一樣。
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setUndoTx(null)}
                className="flex-1 py-4 bg-slate-100 rounded-2xl font-bold"
              >
                取消
              </button>
              <button
                onClick={executeUndo}
                className="flex-2 py-4 bg-rose-600 text-white rounded-2xl font-bold shadow-lg shadow-rose-200 active:scale-95 transition-transform px-4"
              >
                確認還原
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
