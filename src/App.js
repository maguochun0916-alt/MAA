import React, { useState, useEffect, useMemo } from "react";
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
// 🚀 快速設定區 (已換成你的專屬 Firebase)
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

// --- Firebase Init ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export default function App() {
  // --- State ---
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState("connecting");

  // System State
  const [systemData, setSystemData] = useState({
    fundBalance: 0,
    stats: {
      YING_KAI: { advance: 0, owes: 0 },
      PEI_YAO: { advance: 0, owes: 0 },
      KUO_CHUN: { advance: 0, owes: 0 },
    },
  });

  // Modals
  const [showAddFund, setShowAddFund] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState({
    show: false,
    broId: null,
    type: null,
  });
  const [showTargetCalc, setShowTargetCalc] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [undoTx, setUndoTx] = useState(null);
  const [clearHistoryOnSave, setClearHistoryOnSave] = useState(false);

  // Forms
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [splitType, setSplitType] = useState("TWO");
  const [paidBy, setPaidBy] = useState("FUND");
  const [targetAmount, setTargetAmount] = useState("50000");
  const [settingsForm, setSettingsForm] = useState({
    fundBalance: 0,
    ying_kai_advance: 0,
    ying_kai_owes: 0,
    pei_yao_advance: 0,
    pei_yao_owes: 0,
    kuo_chun_advance: 0,
    kuo_chun_owes: 0,
  });

  // Auto-fill Memory States
  const [isAmountTouched, setIsAmountTouched] = useState(false);
  const [autoFillHint, setAutoFillHint] = useState("");

  // --- 1. Firebase Auth ---
  useEffect(() => {
    // 隱藏 CodeSandbox 浮水印
    try {
      if (window.top !== window.self) {
        window.top.location = window.self.location;
      }
    } catch (e) {}

    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        setSyncStatus("error");
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) setSyncStatus("error");
    });
    return () => unsubscribe();
  }, []);

  // --- 2. Firebase Data Fetching ---
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
      query(txRef),
      (snapshot) => {
        const txs = [];
        snapshot.forEach((doc) => {
          txs.push({ ...doc.data(), id: doc.id });
        });
        txs.sort((a, b) => b.timestamp - a.timestamp);
        setTransactions(txs);
        setSyncStatus("synced");
      },
      (error) => setSyncStatus("error")
    );

    const unsubState = onSnapshot(
      stateRef,
      (docSnap) => {
        if (docSnap.exists()) setSystemData(docSnap.data());
        else setDoc(stateRef, systemData);
        setIsLoaded(true);
      },
      (error) => setSyncStatus("error")
    );

    return () => {
      unsubTx();
      unsubState();
    };
  }, [user]);

  // --- 3. Auto-fill Magic Logic ---
  useEffect(() => {
    if (!showAddExpense || isAmountTouched || !description) {
      if (!description) setAutoFillHint("");
      return;
    }

    const cleanStr = (str) => str.replace(/[0-9月日\/\-.\s]/g, "");
    const currentKeyword = cleanStr(description);

    if (currentKeyword.length >= 2) {
      const lastMatch = transactions.find((tx) => {
        if (tx.type !== "EXPENSE") return false;
        const txKeyword = cleanStr(tx.description);
        if (txKeyword.length < 2) return false;
        return (
          txKeyword.includes(currentKeyword) ||
          currentKeyword.includes(txKeyword)
        );
      });

      if (lastMatch) {
        setAmount(lastMatch.amount.toString());
        setSplitType(lastMatch.splitType);
        setPaidBy(lastMatch.paidBy);
        setAutoFillHint(`自動帶入「${lastMatch.description}」的設定 ✨`);
      } else {
        setAutoFillHint("");
      }
    } else {
      setAutoFillHint("");
    }
  }, [description, isAmountTouched, transactions, showAddExpense]);

  // --- Core Update Logic ---
  const commitUpdate = async (newTx, newStateUpdates) => {
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

      let updatedSystemData = { ...systemData, stats: { ...systemData.stats } };

      if (newStateUpdates.fundBalance !== undefined)
        updatedSystemData.fundBalance += newStateUpdates.fundBalance;

      ["YING_KAI", "PEI_YAO", "KUO_CHUN"].forEach((bro) => {
        if (newStateUpdates[bro]) {
          updatedSystemData.stats[bro] = { ...updatedSystemData.stats[bro] };
          if (newStateUpdates[bro].advance !== undefined)
            updatedSystemData.stats[bro].advance +=
              newStateUpdates[bro].advance;
          if (newStateUpdates[bro].owes !== undefined)
            updatedSystemData.stats[bro].owes += newStateUpdates[bro].owes;
        }
      });

      await setDoc(txRef, newTx);
      await setDoc(stateRef, updatedSystemData);

      setSyncStatus("synced");
    } catch (e) {
      setSyncStatus("error");
    }
  };

  // --- Undo Logic ---
  const executeUndo = async () => {
    const txToUndo = undoTx;
    if (!txToUndo || !user) {
      setUndoTx(null);
      return;
    }

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
        txToUndo.id
      );

      let updatedSystemData = {
        ...systemData,
        stats: {
          YING_KAI: { ...systemData.stats.YING_KAI },
          PEI_YAO: { ...systemData.stats.PEI_YAO },
          KUO_CHUN: { ...systemData.stats.KUO_CHUN },
        },
      };

      if (txToUndo.type === "ADD_FUND") {
        updatedSystemData.fundBalance -= txToUndo.amount;
      } else if (txToUndo.type === "EXPENSE") {
        if (txToUndo.paidBy === "FUND") {
          updatedSystemData.fundBalance += txToUndo.amount;
        } else {
          updatedSystemData.stats[txToUndo.paidBy].advance -= txToUndo.amount;
        }

        if (txToUndo.splitType === "TWO") {
          const share = txToUndo.amount / 2;
          updatedSystemData.stats.YING_KAI.owes -= share;
          updatedSystemData.stats.PEI_YAO.owes -= share;
        } else if (txToUndo.splitType === "THREE") {
          const share = txToUndo.amount / 3;
          updatedSystemData.stats.YING_KAI.owes -= share;
          updatedSystemData.stats.PEI_YAO.owes -= share;
          updatedSystemData.stats.KUO_CHUN.owes -= share;
        }
      } else if (txToUndo.type === "CLAIM_ADVANCE") {
        updatedSystemData.fundBalance += txToUndo.amount;
        updatedSystemData.stats[txToUndo.broId].advance += txToUndo.amount;
      } else if (txToUndo.type === "PAY_OWES") {
        updatedSystemData.fundBalance -= txToUndo.amount;
        updatedSystemData.stats[txToUndo.broId].owes += txToUndo.amount;
      } else if (txToUndo.type === "REPLENISH_FUND") {
        updatedSystemData.fundBalance -= txToUndo.amount;
      }

      await deleteDoc(txRef);
      await setDoc(stateRef, updatedSystemData);
      setSyncStatus("synced");
    } catch (e) {
      setSyncStatus("error");
    }
    setUndoTx(null);
  };

  // --- Handlers ---
  const handleAddFund = (e) => {
    e.preventDefault();
    if (!amount || isNaN(amount) || amount <= 0) return;
    const parsedAmount = parseFloat(amount);
    const newTx = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      type: "ADD_FUND",
      amount: parsedAmount,
      description: description || "單純存入共用金",
      author: user.uid,
    };
    commitUpdate(newTx, { fundBalance: parsedAmount });
    closeModals();
  };

  const handleAddExpense = (e) => {
    e.preventDefault();
    if (!amount || isNaN(amount) || amount <= 0 || !description) return;

    const parsedAmount = parseFloat(amount);
    const newTx = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      type: "EXPENSE",
      amount: parsedAmount,
      description,
      splitType,
      paidBy,
      author: user.uid,
    };

    let updates = { fundBalance: 0, YING_KAI: {}, PEI_YAO: {}, KUO_CHUN: {} };

    if (paidBy === "FUND") {
      updates.fundBalance -= parsedAmount;
    } else {
      updates[paidBy].advance = parsedAmount;
    }

    if (splitType === "TWO") {
      const share = parsedAmount / 2;
      updates.YING_KAI.owes = share;
      updates.PEI_YAO.owes = share;
    } else if (splitType === "THREE") {
      const share = parsedAmount / 3;
      updates.YING_KAI.owes = share;
      updates.PEI_YAO.owes = share;
      updates.KUO_CHUN.owes = share;
    }

    commitUpdate(newTx, updates);
    closeModals();
  };

  const handleSettleAction = () => {
    const { broId, type } = showSettleModal;
    if (!broId || !type) return;

    const currentBroStats = systemData.stats[broId];
    const amountToSettle =
      type === "ADVANCE" ? currentBroStats.advance : currentBroStats.owes;
    if (amountToSettle <= 0) return;

    const newTx = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      type: type === "ADVANCE" ? "CLAIM_ADVANCE" : "PAY_OWES",
      broId: broId,
      amount: amountToSettle,
      description:
        type === "ADVANCE"
          ? `${BROTHERS[broId].name.split(" ")[0]} 從共用金領回墊付款`
          : `${BROTHERS[broId].name.split(" ")[0]} 支付欠款給共用金`,
      author: user.uid,
    };

    let updates = { fundBalance: 0, [broId]: {} };

    if (type === "ADVANCE") {
      updates.fundBalance = -amountToSettle;
      updates[broId].advance = -amountToSettle;
    } else {
      updates.fundBalance = amountToSettle;
      updates[broId].owes = -amountToSettle;
    }

    commitUpdate(newTx, updates);
    closeModals();
  };

  const handleReplenishFund = (actualAddFundCash) => {
    const newTx = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      type: "REPLENISH_FUND",
      amount: actualAddFundCash,
      description: `大二哥平分補現金至共用金`,
      author: user.uid,
    };
    commitUpdate(newTx, { fundBalance: actualAddFundCash });
    closeModals();
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    if (!user) return;

    setSyncStatus("connecting");
    const newState = {
      fundBalance: parseFloat(settingsForm.fundBalance) || 0,
      stats: {
        YING_KAI: {
          advance: parseFloat(settingsForm.ying_kai_advance) || 0,
          owes: parseFloat(settingsForm.ying_kai_owes) || 0,
        },
        PEI_YAO: {
          advance: parseFloat(settingsForm.pei_yao_advance) || 0,
          owes: parseFloat(settingsForm.pei_yao_owes) || 0,
        },
        KUO_CHUN: {
          advance: parseFloat(settingsForm.kuo_chun_advance) || 0,
          owes: parseFloat(settingsForm.kuo_chun_owes) || 0,
        },
      },
    };

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
      await setDoc(stateRef, newState);

      if (clearHistoryOnSave && transactions.length > 0) {
        for (const tx of transactions) {
          await deleteDoc(
            doc(
              db,
              "artifacts",
              appId,
              "public",
              "data",
              `${SHARED_LEDGER_NAME}_transactions`,
              tx.id
            )
          );
        }
      }
      setSyncStatus("synced");
    } catch (error) {
      setSyncStatus("error");
    }
    setClearHistoryOnSave(false);
    closeModals();
  };

  const closeModals = () => {
    setShowAddFund(false);
    setShowAddExpense(false);
    setShowSettleModal({ show: false, broId: null, type: null });
    setShowTargetCalc(false);
    setShowSettings(false);
    setUndoTx(null);
    setAmount("");
    setDescription("");
    setSplitType("TWO");
    setPaidBy("FUND");
    setIsAmountTouched(false);
    setAutoFillHint("");
  };

  const openSettings = () => {
    setSettingsForm({
      fundBalance: systemData.fundBalance,
      ying_kai_advance: systemData.stats.YING_KAI.advance,
      ying_kai_owes: systemData.stats.YING_KAI.owes,
      pei_yao_advance: systemData.stats.PEI_YAO.advance,
      pei_yao_owes: systemData.stats.PEI_YAO.owes,
      kuo_chun_advance: systemData.stats.KUO_CHUN.advance,
      kuo_chun_owes: systemData.stats.KUO_CHUN.owes,
    });
    setClearHistoryOnSave(false);
    setShowSettings(true);
  };

  const formatMoney = (num) => "$" + Math.round(num).toLocaleString("en-US");
  const formatDate = (ts) => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${d
      .getHours()
      .toString()
      .padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };

  const renderBrotherCardMobile = (broId) => {
    const bro = BROTHERS[broId];
    const stats = systemData.stats[broId] || { advance: 0, owes: 0 };

    return (
      <div
        key={broId}
        className="bg-white rounded-3xl p-4 shadow-sm border border-slate-200"
      >
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-full text-white flex items-center justify-center shadow-inner ${bro.iconBg}`}
            >
              <User className="w-5 h-5" />
            </div>
            <span className="font-bold text-slate-800 text-base">
              {bro.name}
            </span>
          </div>
          <div className="text-xs font-bold text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
            個人帳務
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2 p-3 rounded-2xl bg-rose-50 border border-rose-100/50">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-rose-500 mb-0.5">
                應付(欠款)
              </span>
              <span className="font-black text-rose-700 text-lg leading-none">
                {formatMoney(stats.owes)}
              </span>
            </div>
            {stats.owes > 0 ? (
              <button
                onClick={() =>
                  setShowSettleModal({ show: true, broId, type: "OWES" })
                }
                className="w-full bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold py-2.5 rounded-xl transition-colors shadow-sm active:scale-95 flex justify-center items-center gap-1.5 mt-1"
              >
                <ArrowUpFromLine className="w-4 h-4" />
                補錢入庫
              </button>
            ) : (
              <div className="w-full py-2.5 mt-1 text-center text-rose-300 text-xs font-medium">
                無欠款
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 p-3 rounded-2xl bg-emerald-50 border border-emerald-100/50">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-emerald-500 mb-0.5">
                已墊付
              </span>
              <span className="font-black text-emerald-700 text-lg leading-none">
                {formatMoney(stats.advance)}
              </span>
            </div>
            {stats.advance > 0 ? (
              <button
                onClick={() =>
                  setShowSettleModal({ show: true, broId, type: "ADVANCE" })
                }
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold py-2.5 rounded-xl transition-colors shadow-sm active:scale-95 flex justify-center items-center gap-1.5 mt-1"
              >
                <ArrowDownToLine className="w-4 h-4" />
                水庫領回
              </button>
            ) : (
              <div className="w-full py-2.5 mt-1 text-center text-emerald-300 text-xs font-medium">
                無墊付
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderTargetCalc = () => {
    const target = parseFloat(targetAmount) || 0;
    const currentShortfall = target - systemData.fundBalance;
    const halfShortfall = currentShortfall / 2;

    return (
      <div className="space-y-5">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            大二哥要補滿的目標總額
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-lg">
              $
            </span>
            <input
              type="number"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              className="w-full pl-10 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:outline-none text-xl font-black text-slate-800"
            />
          </div>
        </div>

        {currentShortfall <= 0 ? (
          <div className="p-5 bg-emerald-50 text-emerald-700 rounded-2xl border border-emerald-200 text-center font-bold">
            🎉 目前共用金已達標，不需補錢！
          </div>
        ) : (
          <>
            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium">目標金額</span>
                <span className="font-bold text-slate-700">
                  {formatMoney(target)}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium">目前共用金</span>
                <span
                  className={`font-bold ${
                    systemData.fundBalance < 0
                      ? "text-rose-600"
                      : "text-slate-700"
                  }`}
                >
                  {formatMoney(systemData.fundBalance)}
                </span>
              </div>
              <div className="border-t border-slate-200/80 my-2"></div>
              <div className="flex justify-between items-center text-base font-black">
                <span className="text-slate-800">總共需要補足</span>
                <span className="text-indigo-600 text-xl">
                  {formatMoney(currentShortfall)}
                </span>
              </div>
            </div>

            <div className="bg-indigo-50 rounded-2xl p-5 border border-indigo-100">
              <h4 className="font-bold text-indigo-900 mb-4 text-sm flex items-center gap-2">
                <User className="w-4 h-4" /> 大哥二哥 每人需拿出現金：
              </h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-indigo-50">
                  <span className="font-bold text-indigo-900 flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-indigo-500"></div>
                    大哥
                  </span>
                  <span className="font-black text-xl text-rose-600">
                    {formatMoney(halfShortfall)}
                  </span>
                </div>
                <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-indigo-50">
                  <span className="font-bold text-emerald-900 flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                    二哥
                  </span>
                  <span className="font-black text-xl text-rose-600">
                    {formatMoney(halfShortfall)}
                  </span>
                </div>
              </div>
              <p className="text-xs text-indigo-700/70 mt-4 text-center leading-relaxed">
                (註：若有人身上有未結算的墊付款或欠款，請先在首頁卡片點擊「水庫領回」或「補錢入庫」結清後再來算錢喔！)
              </p>
            </div>

            <button
              onClick={() => handleReplenishFund(currentShortfall)}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl transition-colors active:scale-95 shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 text-lg"
            >
              <CheckCircle2 className="w-6 h-6" />
              確認已將現金存入水庫
            </button>
          </>
        )}
      </div>
    );
  };

  if (!isLoaded)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-500 gap-4">
        <div className="p-4 bg-white rounded-full shadow-sm animate-bounce">
          <Cloud className="w-8 h-8 text-indigo-500" />
        </div>
        <p className="font-bold text-sm tracking-widest text-slate-400">
          連接共用資料庫中...
        </p>
      </div>
    );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-32 relative selection:bg-indigo-100">
      {/* 隱藏 CodeSandbox 水印及卷軸 */}
      <style>{`
        ::-webkit-scrollbar { display: none; }
        html { -ms-overflow-style: none; scrollbar-width: none; scroll-behavior: smooth; }
        #csb-bottom-pane, #csb-bottom-pane-mobile, div[class*="Watermark"], a[href*="codesandbox"], div[data-testid="csb-watermark"] { 
          display: none !important; opacity: 0 !important; pointer-events: none !important; z-index: -9999 !important; height: 0 !important; width: 0 !important;
        }
      `}</style>

      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md shadow-sm pt-6 pb-4 px-4 sticky top-0 z-20 flex justify-between items-center">
        <div className="w-10 flex justify-center">
          {syncStatus === "synced" ? (
            <Cloud className="w-5 h-5 text-emerald-500" />
          ) : syncStatus === "connecting" ? (
            <Cloud className="w-5 h-5 text-amber-500 animate-pulse" />
          ) : (
            <CloudOff className="w-5 h-5 text-rose-500" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <Wallet className="w-7 h-7 text-indigo-600 drop-shadow-sm" />
          <h1 className="text-xl font-black text-slate-900 tracking-wide">
            馬家共用帳本
          </h1>
        </div>
        <button
          onClick={openSettings}
          className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-full transition-colors active:scale-95"
        >
          <Settings className="w-5 h-5" />
        </button>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-6">
        {/* Dashboard */}
        <section className="space-y-4">
          <div className="bg-slate-900 rounded-[2rem] p-6 text-white shadow-xl shadow-slate-900/10 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-500/20 rounded-full blur-3xl -mr-10 -mt-10"></div>
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-emerald-500/20 rounded-full blur-3xl -ml-10 -mb-10"></div>

            <div className="relative z-10 flex flex-col gap-4">
              <div>
                <p className="text-slate-400 text-sm font-bold tracking-widest uppercase mb-1 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                  目前水庫總額
                </p>
                <h2
                  className={`text-5xl font-black tracking-tighter ${
                    systemData.fundBalance < 0 ? "text-rose-400" : "text-white"
                  }`}
                >
                  {formatMoney(systemData.fundBalance)}
                </h2>
              </div>

              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => setShowTargetCalc(true)}
                  className="flex-1 bg-white/10 hover:bg-white/20 backdrop-blur-md py-3 px-4 rounded-xl transition-colors active:scale-95 flex justify-center items-center gap-2"
                >
                  <Calculator className="w-5 h-5 text-indigo-300" />
                  <span className="text-sm font-bold text-white tracking-wide">
                    大二哥算錢補水庫
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {renderBrotherCardMobile("YING_KAI")}
            {renderBrotherCardMobile("PEI_YAO")}
            {renderBrotherCardMobile("KUO_CHUN")}
          </div>
        </section>

        {/* History List */}
        <section className="bg-white rounded-[2rem] p-5 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-slate-100 rounded-full">
                <History className="w-5 h-5 text-slate-500" />
              </div>
              <h3 className="text-base font-bold text-slate-800">歷史紀錄</h3>
            </div>

            {transactions.length > 0 && (
              <button
                onClick={() => setUndoTx(transactions[0])}
                className="text-xs flex items-center gap-1.5 bg-slate-800 text-white font-bold py-2 px-3 rounded-full active:scale-95 transition-transform shadow-md"
              >
                <Undo2 className="w-3.5 h-3.5" />
                退回最新
              </button>
            )}
          </div>

          <div className="space-y-4">
            {transactions.length === 0 ? (
              <div className="text-center py-12 flex flex-col items-center justify-center gap-2">
                <ReceiptText className="w-10 h-10 text-slate-200" />
                <p className="text-slate-400 font-medium">目前沒有任何紀錄</p>
              </div>
            ) : (
              transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="group relative flex items-start gap-3 p-3 rounded-2xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100"
                >
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 shadow-sm ${
                      tx.type === "EXPENSE"
                        ? "bg-rose-100 text-rose-600"
                        : tx.type === "CLAIM_ADVANCE"
                        ? "bg-emerald-100 text-emerald-600"
                        : tx.type === "PAY_OWES" ||
                          tx.type === "REPLENISH_FUND" ||
                          tx.type === "ADD_FUND"
                        ? "bg-indigo-100 text-indigo-600"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {tx.type === "EXPENSE" ? (
                      <ReceiptText className="w-6 h-6" />
                    ) : tx.type === "CLAIM_ADVANCE" ? (
                      <ArrowDownToLine className="w-6 h-6" />
                    ) : tx.type === "PAY_OWES" ? (
                      <ArrowUpFromLine className="w-6 h-6" />
                    ) : tx.type === "REPLENISH_FUND" ? (
                      <Calculator className="w-6 h-6" />
                    ) : (
                      <Wallet className="w-6 h-6" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className="font-bold text-slate-800 text-base leading-tight truncate">
                      {tx.description}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 mt-1.5 font-medium">
                      <span>{formatDate(tx.timestamp)}</span>
                      {tx.type === "EXPENSE" && (
                        <>
                          <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded-md text-slate-600">
                            {tx.splitType === "TWO" ? "大二哥" : "三人"}
                          </span>
                          <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                          <span className="text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-md">
                            {tx.paidBy === "FUND"
                              ? "扣水庫"
                              : `${BROTHERS[tx.paidBy]?.name.split(" ")[0]}墊`}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div
                      className={`font-black text-base ${
                        tx.type === "EXPENSE" || tx.type === "CLAIM_ADVANCE"
                          ? "text-rose-600"
                          : "text-emerald-600"
                      }`}
                    >
                      {tx.type === "EXPENSE" || tx.type === "CLAIM_ADVANCE"
                        ? "-"
                        : "+"}
                      {formatMoney(tx.amount)}
                    </div>
                    <button
                      onClick={() => setUndoTx(tx)}
                      className="p-2 -mr-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-colors active:scale-90"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="h-[200px] w-full flex items-end justify-center pb-4 opacity-50"></div>
        </section>
      </main>

      {/* --- Bottom Action Bar --- */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-slate-200/60 p-4 z-30 shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.1)] pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
        <div className="max-w-md mx-auto flex gap-3">
          <button
            onClick={() => setShowAddExpense(true)}
            className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-4 rounded-2xl transition-colors active:scale-95 shadow-lg shadow-rose-200 flex items-center justify-center gap-2 text-base"
          >
            <ReceiptText className="w-6 h-6" />
            <span>記一筆花費</span>
          </button>
          <button
            onClick={() => setShowAddFund(true)}
            className="w-16 shrink-0 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl transition-colors active:scale-95 flex flex-col items-center justify-center gap-1 shadow-sm border border-slate-200"
            title="存現金入庫"
          >
            <PlusCircle className="w-6 h-6 text-slate-500" />
            <span className="text-[10px] font-bold">存入</span>
          </button>
        </div>
      </div>

      {/* --- Undo Confirm Modal --- */}
      {undoTx && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm p-6 sm:p-8 animate-in slide-in-from-bottom-8 sm:zoom-in-95 shadow-2xl pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6 sm:hidden"></div>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-rose-600" />
              </div>
              <h3 className="text-xl font-black text-slate-900">
                確定收回此紀錄？
              </h3>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 mb-5">
              <p className="font-bold text-slate-800 text-base">
                {undoTx.description}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                金額：
                <span className="font-black text-slate-800">
                  {formatMoney(undoTx.amount)}
                </span>
              </p>
            </div>

            <p className="text-sm text-slate-500 mb-8 font-medium leading-relaxed">
              系統會像時光倒流一樣幫你自動{" "}
              <span className="text-rose-600 font-bold">
                加回扣掉的錢、扣除增加的錢
              </span>
              ，完美回到按錯前的狀態！
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setUndoTx(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-4 rounded-2xl active:scale-95 transition-all text-base"
              >
                取消
              </button>
              <button
                onClick={executeUndo}
                disabled={syncStatus !== "synced"}
                className="flex-[2] bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 text-white font-bold py-4 rounded-2xl active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-rose-200 text-base"
              >
                {syncStatus !== "synced" ? "處理中..." : "確認收回還原"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Other Modals (Bottom Sheets) --- */}

      {/* 1. Add Expense Modal */}
      {showAddExpense && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md p-6 sm:p-8 animate-in slide-in-from-bottom-8 shadow-2xl max-h-[90vh] overflow-y-auto pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6 sm:hidden"></div>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-slate-900">新增花費</h3>
              <button
                onClick={closeModals}
                className="p-2 -mr-2 text-slate-400 hover:bg-slate-100 rounded-full active:scale-90"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleAddExpense} className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  花費項目
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-rose-500 focus:outline-none text-base"
                  placeholder="如：房租、水電、三人聚餐"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  總金額
                </label>
                <div className="relative">
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-lg">
                    $
                  </span>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      setIsAmountTouched(true);
                      setAutoFillHint("");
                    }}
                    className="w-full pl-10 pr-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-rose-500 focus:outline-none text-xl font-black"
                    placeholder="0"
                    required
                  />
                </div>

                {autoFillHint && (
                  <div className="mt-3 flex items-center gap-1.5 px-4 py-2.5 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-600 text-xs font-bold animate-in fade-in slide-in-from-top-2">
                    <Sparkles className="w-4 h-4 shrink-0" />
                    {autoFillHint}
                  </div>
                )}
              </div>

              <div className="p-5 bg-slate-50 rounded-3xl border border-slate-200 space-y-5">
                <div>
                  <label className="block text-sm font-black text-slate-800 mb-3">
                    1. 誰要負擔這筆錢？ (欠款方)
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setSplitType("TWO")}
                      className={`py-3 px-3 rounded-xl border text-sm font-bold transition-all active:scale-95 ${
                        splitType === "TWO"
                          ? "bg-indigo-600 border-indigo-600 text-white shadow-md"
                          : "bg-white border-slate-200 text-slate-600"
                      }`}
                    >
                      大哥 & 二哥
                    </button>
                    <button
                      type="button"
                      onClick={() => setSplitType("THREE")}
                      className={`py-3 px-3 rounded-xl border text-sm font-bold transition-all active:scale-95 ${
                        splitType === "THREE"
                          ? "bg-amber-500 border-amber-500 text-white shadow-md"
                          : "bg-white border-slate-200 text-slate-600"
                      }`}
                    >
                      三兄弟 (含老三)
                    </button>
                  </div>
                </div>

                <div className="border-t border-slate-200/80 pt-4">
                  <label className="block text-sm font-black text-slate-800 mb-3">
                    2. 誰付的款？ (出錢方)
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPaidBy("FUND")}
                      className={`col-span-2 py-3.5 px-3 rounded-xl border text-base font-bold transition-all active:scale-95 flex items-center justify-center gap-2 ${
                        paidBy === "FUND"
                          ? "bg-slate-800 border-slate-800 text-white shadow-md"
                          : "bg-white border-slate-200 text-slate-600"
                      }`}
                    >
                      <Wallet className="w-5 h-5" /> 從「水庫」直接扣款
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaidBy("YING_KAI")}
                      className={`py-3 px-3 rounded-xl border text-sm font-bold transition-all active:scale-95 ${
                        paidBy === "YING_KAI"
                          ? "bg-indigo-100 border-indigo-500 text-indigo-700"
                          : "bg-white border-slate-200 text-slate-600"
                      }`}
                    >
                      大哥 墊付
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaidBy("PEI_YAO")}
                      className={`py-3 px-3 rounded-xl border text-sm font-bold transition-all active:scale-95 ${
                        paidBy === "PEI_YAO"
                          ? "bg-emerald-100 border-emerald-500 text-emerald-700"
                          : "bg-white border-slate-200 text-slate-600"
                      }`}
                    >
                      二哥 墊付
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaidBy("KUO_CHUN")}
                      className={`col-span-2 py-3 px-3 rounded-xl border text-sm font-bold transition-all active:scale-95 ${
                        paidBy === "KUO_CHUN"
                          ? "bg-amber-100 border-amber-500 text-amber-700"
                          : "bg-white border-slate-200 text-slate-600"
                      }`}
                    >
                      老三 幫忙墊付
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={syncStatus !== "synced"}
                className="w-full bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-rose-200 flex justify-center items-center gap-2 text-lg active:scale-95 mt-4"
              >
                {syncStatus !== "synced" ? "雲端同步中..." : "確認新增"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 2. Settle Individual Modal */}
      {showSettleModal.show && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md p-6 sm:p-8 animate-in slide-in-from-bottom-8 shadow-2xl pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6 sm:hidden"></div>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-900">
                結算 {BROTHERS[showSettleModal.broId].name.split(" ")[0]} 的{" "}
                {showSettleModal.type === "OWES" ? "欠款" : "墊付款"}
              </h3>
              <button
                onClick={closeModals}
                className="p-2 -mr-2 text-slate-400 hover:bg-slate-100 rounded-full active:scale-90"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6">
              <div
                className={`p-6 rounded-3xl border mb-2 text-center ${
                  showSettleModal.type === "OWES"
                    ? "bg-rose-50 border-rose-200"
                    : "bg-emerald-50 border-emerald-200"
                }`}
              >
                <p
                  className={`text-sm font-bold mb-2 ${
                    showSettleModal.type === "OWES"
                      ? "text-rose-700"
                      : "text-emerald-700"
                  }`}
                >
                  準備結算金額
                </p>
                <p
                  className={`text-5xl font-black ${
                    showSettleModal.type === "OWES"
                      ? "text-rose-600"
                      : "text-emerald-600"
                  }`}
                >
                  {formatMoney(
                    showSettleModal.type === "OWES"
                      ? systemData.stats[showSettleModal.broId].owes
                      : systemData.stats[showSettleModal.broId].advance
                  )}
                </p>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl text-sm font-medium text-slate-600 leading-relaxed">
                {showSettleModal.type === "OWES"
                  ? "按下確認後，代表他拿現金出來了。這筆錢會加進水庫總額，並清空他的欠款紀錄。"
                  : "按下確認後，代表從水庫拿錢還給他。這筆錢會從水庫總額扣除，並清空他的墊付紀錄。"}
              </div>

              <button
                onClick={handleSettleAction}
                disabled={syncStatus !== "synced"}
                className={`w-full font-bold py-4 rounded-2xl mt-2 text-white flex items-center justify-center gap-2 active:scale-95 transition-all text-lg shadow-lg disabled:opacity-50 ${
                  showSettleModal.type === "OWES"
                    ? "bg-rose-600 shadow-rose-200"
                    : "bg-emerald-600 shadow-emerald-200"
                }`}
              >
                {showSettleModal.type === "OWES" ? (
                  <ArrowUpFromLine className="w-6 h-6" />
                ) : (
                  <ArrowDownToLine className="w-6 h-6" />
                )}
                確認完成結算
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Add Simple Fund Modal */}
      {showAddFund && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md p-6 sm:p-8 animate-in slide-in-from-bottom-8 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] shadow-2xl">
            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6 sm:hidden"></div>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-slate-900">
                單純存入現金
              </h3>
              <button
                onClick={closeModals}
                className="p-2 -mr-2 text-slate-400 hover:bg-slate-100 rounded-full active:scale-90"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <p className="text-sm font-medium text-slate-500 mb-6 bg-slate-50 p-4 rounded-2xl">
              只記錄有錢進共用金水庫。不會影響任何人的墊付與欠款紀錄。
            </p>
            <form onSubmit={handleAddFund} className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  存入金額
                </label>
                <div className="relative">
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-lg">
                    $
                  </span>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full pl-10 pr-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-slate-500 focus:outline-none text-xl font-black text-slate-800"
                    autoFocus
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={syncStatus !== "synced"}
                className="w-full bg-slate-800 text-white font-bold py-4 rounded-2xl text-lg active:scale-95 transition-all shadow-lg disabled:opacity-50"
              >
                確認存入
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 4. Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md flex flex-col max-h-[90vh] sm:max-h-[85vh] animate-in slide-in-from-bottom-8 my-0 sm:my-8 shadow-2xl">
            <div className="p-6 sm:p-8 pb-4 shrink-0">
              <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6 sm:hidden"></div>
              <div className="flex justify-between items-center">
                <h3 className="text-xl sm:text-2xl font-black text-slate-900">
                  手動校正帳務
                </h3>
                <button
                  onClick={closeModals}
                  className="p-2 -mr-2 text-slate-400 hover:bg-slate-100 rounded-full active:scale-90"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-6 sm:p-8 pt-0 overflow-y-auto flex-1 overscroll-contain">
              <form
                onSubmit={handleSaveSettings}
                className="space-y-4 sm:space-y-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]"
              >
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-2 ml-1">
                    目前水庫總額 (可負數)
                  </label>
                  <input
                    type="number"
                    value={settingsForm.fundBalance}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        fundBalance: e.target.value,
                      })
                    }
                    className="w-full px-4 py-3 sm:py-3.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-lg text-slate-800"
                  />
                </div>

                {["ying_kai", "pei_yao", "kuo_chun"].map((bro, idx) => {
                  const colors = [
                    "text-indigo-600",
                    "text-emerald-600",
                    "text-amber-600",
                  ];
                  const bgColors = [
                    "bg-indigo-50/50",
                    "bg-emerald-50/50",
                    "bg-amber-50/50",
                  ];
                  const borderColors = [
                    "border-indigo-100",
                    "border-emerald-100",
                    "border-amber-100",
                  ];
                  const names = ["大哥", "二哥", "老三"];
                  return (
                    <div
                      key={bro}
                      className={`p-4 ${bgColors[idx]} border ${borderColors[idx]} rounded-2xl space-y-3`}
                    >
                      <p
                        className={`text-sm font-black ${colors[idx]} uppercase`}
                      >
                        {names[idx]} 帳務
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1.5">
                            應付(欠款)
                          </label>
                          <input
                            type="number"
                            value={settingsForm[`${bro}_owes`]}
                            onChange={(e) =>
                              setSettingsForm({
                                ...settingsForm,
                                [`${bro}_owes`]: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2.5 sm:py-2 border border-slate-200 rounded-lg font-bold text-slate-700 bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1.5">
                            已幫墊付
                          </label>
                          <input
                            type="number"
                            value={settingsForm[`${bro}_advance`]}
                            onChange={(e) =>
                              setSettingsForm({
                                ...settingsForm,
                                [`${bro}_advance`]: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2.5 sm:py-2 border border-slate-200 rounded-lg font-bold text-slate-700 bg-white"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div className="pt-2">
                  <label className="flex items-start sm:items-center gap-3 p-4 bg-rose-50 border border-rose-100 rounded-2xl cursor-pointer active:scale-[0.98] transition-transform">
                    <input
                      type="checkbox"
                      checked={clearHistoryOnSave}
                      onChange={(e) => setClearHistoryOnSave(e.target.checked)}
                      className="w-5 h-5 sm:w-6 sm:h-6 text-rose-600 rounded-md border-rose-300 focus:ring-rose-500 shrink-0 mt-0.5 sm:mt-0"
                    />
                    <span className="text-sm font-bold text-rose-700 leading-snug">
                      覆蓋時，同時清空所有雲端歷史紀錄
                    </span>
                  </label>
                </div>

                <div className="pt-4 mt-2 sticky bottom-0 bg-white/80 backdrop-blur-sm py-2">
                  <button
                    type="submit"
                    disabled={syncStatus !== "synced"}
                    className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl disabled:opacity-50 active:scale-95 transition-transform text-lg shadow-lg"
                  >
                    強制覆蓋並同步給所有人
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
