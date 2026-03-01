import React, { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  setDoc,
  query,
  limit,
} from "firebase/firestore";
import {
  Settings2,
  Plus,
  ReceiptText,
  Wallet,
  Trash2,
  History,
  Pencil,
  Check,
  X,
  Save,
  ArrowRightLeft,
  PiggyBank,
  Calculator,
  Coins,
  Calendar,
  Cloud,
  CloudOff,
  AlertCircle,
} from "lucide-react";

// ==========================================
// 🚀 承接舊版 Firebase 設定
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
const LEDGER_COLLECTION = "ma_brothers_ledger_v4"; // 使用新版集合名稱避免結構衝突

// Firebase 初始化
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const BROTHER_IDS = {
  big: "YING_KAI",
  second: "PEI_YAO",
  third: "KUO_CHUN",
};

const App = () => {
  // --- 狀態管理 ---
  const [user, setUser] = useState(null);
  const [syncStatus, setSyncStatus] = useState("connecting");

  const [funds, setFunds] = useState({
    big: { paid: 0, payable: 0 },
    second: { paid: 0, payable: 0 },
    third: { paid: 0, payable: 0 },
  });

  const [quickInputs, setQuickInputs] = useState([
    { id: 1, name: "房租", amount: 9000 },
    { id: 2, name: "NETFLIX", amount: 390 },
    { id: 3, name: "水費", amount: "" },
    { id: 4, name: "電費", amount: "" },
  ]);

  const [logs, setLogs] = useState([]);

  // 表單狀態
  const [activeTab, setActiveTab] = useState("expense");
  const [formName, setFormName] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [payMethod, setPayMethod] = useState("shared");
  const [formPayer, setFormPayer] = useState("big");
  const [formSharers, setFormSharers] = useState({
    big: true,
    second: true,
    third: true,
  });
  const [saveAsQuick, setSaveAsQuick] = useState(false);

  const [expenseDate, setExpenseDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [isMonthOnly, setIsMonthOnly] = useState(false);

  const [depositAmount, setDepositAmount] = useState("");
  const [editingField, setEditingField] = useState(null);
  const [editAmount, setEditAmount] = useState("");

  // --- 1. Firebase 驗證 ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        setSyncStatus("error");
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // --- 2. Firestore 資料同步 (無痛替換核心) ---
  useEffect(() => {
    if (!user) return;

    const stateRef = doc(
      db,
      "artifacts",
      appId,
      "public",
      "data",
      `${LEDGER_COLLECTION}_state`,
      "main"
    );
    const logsRef = collection(
      db,
      "artifacts",
      appId,
      "public",
      "data",
      `${LEDGER_COLLECTION}_logs`
    );

    // 監聽金額狀態
    const unsubState = onSnapshot(
      stateRef,
      (docSnap) => {
        if (docSnap.exists()) {
          setFunds(docSnap.data().funds);
          setQuickInputs(docSnap.data().quickInputs || quickInputs);
        } else {
          // 初始化雲端資料庫
          setDoc(stateRef, { funds, quickInputs });
        }
        setSyncStatus("synced");
      },
      () => setSyncStatus("error")
    );

    // 監聽紀錄 (限最新 50 筆)
    const unsubLogs = onSnapshot(logsRef, (snapshot) => {
      const list = [];
      snapshot.forEach((d) => list.push({ ...d.data(), id: d.id }));
      list.sort((a, b) => b.timestamp - a.timestamp);
      setLogs(list.slice(0, 50));
    });

    return () => {
      unsubState();
      unsubLogs();
    };
  }, [user]);

  // --- 雲端寫入函數 ---
  const commitUpdate = async (newFunds, newLog = null) => {
    if (!user) return;
    setSyncStatus("connecting");
    try {
      const stateRef = doc(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        `${LEDGER_COLLECTION}_state`,
        "main"
      );
      await setDoc(stateRef, { funds: newFunds, quickInputs }, { merge: true });

      if (newLog) {
        const logId = Date.now().toString();
        const logRef = doc(
          db,
          "artifacts",
          appId,
          "public",
          "data",
          `${LEDGER_COLLECTION}_logs`,
          logId
        );
        await setDoc(logRef, { ...newLog, id: logId, timestamp: Date.now() });
      }
      setSyncStatus("synced");
    } catch (e) {
      setSyncStatus("error");
    }
  };

  // --- 輔助函數 ---
  const getPersonName = (key) => {
    switch (key) {
      case "big":
        return "大哥 英凱";
      case "second":
        return "二哥 培堯";
      case "third":
        return "三弟 國郡";
      default:
        return "未知";
    }
  };

  const getDisplayDate = (dateStr, monthOnly) => {
    if (!dateStr) return "";
    if (monthOnly) {
      const [year, month] = dateStr.split("-");
      return `${year}年${month}月`;
    }
    return dateStr;
  };

  // --- 核心操作 ---
  const handleAddExpense = (e) => {
    e.preventDefault();
    if (!formName || !formAmount || isNaN(formAmount)) return;

    const amountNum = Number(formAmount);
    const dateLabel = getDisplayDate(expenseDate, isMonthOnly);
    const nextFunds = JSON.parse(JSON.stringify(funds));
    let logEntry = null;

    if (payMethod === "shared") {
      nextFunds.third.paid += amountNum;
      logEntry = {
        date: dateLabel,
        type: "expense",
        desc: `[公費] ${formName}`,
        amount: amountNum,
        details: `使用公費支付，由管理員帳戶紀錄`,
      };
    } else {
      nextFunds[formPayer].paid += amountNum;
      const sharersCount = Object.values(formSharers).filter(Boolean).length;
      const shareAmount = Math.round(amountNum / (sharersCount || 1));

      Object.keys(formSharers).forEach((person) => {
        if (formSharers[person]) {
          nextFunds[person].payable += shareAmount;
        }
      });
      const names = Object.keys(formSharers)
        .filter((k) => formSharers[k])
        .map(getPersonName)
        .join("、");
      logEntry = {
        date: dateLabel,
        type: "expense",
        desc: `[個人] ${formName}`,
        amount: amountNum,
        details: `由 ${getPersonName(formPayer)} 支付，${names} 分擔`,
      };
    }

    commitUpdate(nextFunds, logEntry);
    setFormName("");
    setFormAmount("");
  };

  const handleDeposit = (e) => {
    e.preventDefault();
    if (!depositAmount || isNaN(depositAmount) || Number(depositAmount) <= 0)
      return;
    const amountNum = Number(depositAmount);
    const half = Math.round(amountNum / 2);

    const nextFunds = JSON.parse(JSON.stringify(funds));
    nextFunds.big.payable += half;
    nextFunds.second.payable += half;
    nextFunds.third.payable += amountNum;

    commitUpdate(nextFunds, {
      date: new Date().toLocaleDateString(),
      type: "deposit",
      desc: `存入公費責任額`,
      amount: amountNum,
      details: `大哥二哥需各負擔 ${half} 元公費責任`,
    });
    setDepositAmount("");
  };

  const handleSaveEdit = (person, type) => {
    const nextFunds = JSON.parse(JSON.stringify(funds));
    nextFunds[person][type] = Number(editAmount);
    commitUpdate(nextFunds, {
      date: new Date().toLocaleDateString(),
      type: "edit",
      desc: `手動校正金額`,
      amount: 0,
      details: `修正了 ${getPersonName(person)} 的帳務數據`,
    });
    setEditingField(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-32">
      {/* 頂部導航與雲端狀態 */}
      <header className="bg-slate-900 text-white p-4 shadow-md sticky top-0 z-20 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-500 rounded-lg">
            <Coins className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-black tracking-tight">馬家記帳系統 V4</h1>
        </div>
        <div className="flex items-center gap-3">
          {syncStatus === "synced" ? (
            <div className="flex items-center gap-1 text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full">
              <Cloud className="w-3 h-3" /> 雲端同步中
            </div>
          ) : (
            <div className="flex items-center gap-1 text-[10px] bg-amber-500/20 text-amber-400 px-2 py-1 rounded-full animate-pulse">
              <CloudOff className="w-3 h-3" /> 連線中
            </div>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-6 mt-4">
        {/* --- 帳戶面板 (大哥、二哥、三弟) --- */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {["big", "second", "third"].map((person) => {
            const data = funds[person];
            const balance = data.paid - data.payable;
            const isThird = person === "third";

            return (
              <div
                key={person}
                className={`bg-white rounded-2xl shadow-sm border-t-4 overflow-hidden transition-all hover:shadow-md ${
                  isThird
                    ? "border-t-amber-500"
                    : person === "big"
                    ? "border-t-indigo-500"
                    : "border-t-emerald-500"
                }`}
              >
                <div className="p-3 bg-slate-50 border-b flex justify-between items-center">
                  <span className="font-bold text-sm">
                    {getPersonName(person)}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white border border-slate-200">
                    {isThird ? "資金管理" : "出資者"}
                  </span>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400 flex items-center gap-1">
                      代墊 (已出)
                      <button
                        onClick={() => {
                          setEditingField(`${person}_paid`);
                          setEditAmount(data.paid);
                        }}
                      >
                        <Pencil className="w-3 h-3 text-slate-300 hover:text-blue-500" />
                      </button>
                    </span>
                    {editingField === `${person}_paid` ? (
                      <input
                        type="number"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        onBlur={() => handleSaveEdit(person, "paid")}
                        className="w-16 border text-right font-bold"
                        autoFocus
                      />
                    ) : (
                      <span className="font-bold text-slate-700">
                        ${data.paid.toLocaleString()}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400 flex items-center gap-1">
                      需付 (責任)
                      <button
                        onClick={() => {
                          setEditingField(`${person}_payable`);
                          setEditAmount(data.payable);
                        }}
                      >
                        <Pencil className="w-3 h-3 text-slate-300 hover:text-rose-500" />
                      </button>
                    </span>
                    {editingField === `${person}_payable` ? (
                      <input
                        type="number"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        onBlur={() => handleSaveEdit(person, "payable")}
                        className="w-16 border text-right font-bold"
                        autoFocus
                      />
                    ) : (
                      <span className="font-bold text-slate-700">
                        ${data.payable.toLocaleString()}
                      </span>
                    )}
                  </div>

                  <div
                    className={`mt-2 p-3 rounded-xl text-center ${
                      balance >= 0
                        ? "bg-indigo-50 text-indigo-700 border border-indigo-100"
                        : "bg-rose-50 text-rose-700 border border-rose-100"
                    }`}
                  >
                    <div className="text-[10px] font-black uppercase opacity-60 mb-1">
                      個人帳戶淨額
                    </div>
                    <div className="text-xl font-black">
                      ${balance.toLocaleString()}
                    </div>
                    {isThird && (
                      <div className="text-[9px] mt-2 bg-white/60 p-1 rounded font-bold">
                        💰 手中剩餘公費：$
                        {Math.abs(data.paid - data.payable).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        {/* --- 操作面板 --- */}
        <section className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="flex border-b border-slate-100">
            {["expense", "deposit", "logs"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-4 text-sm font-black transition-all ${
                  activeTab === tab
                    ? "text-indigo-600 bg-white"
                    : "bg-slate-50/50 text-slate-400 hover:text-slate-600"
                }`}
              >
                {tab === "expense"
                  ? "記支出"
                  : tab === "deposit"
                  ? "存公費"
                  : "歷史紀錄"}
                {activeTab === tab && (
                  <div className="mx-auto mt-1 w-5 h-1 bg-indigo-600 rounded-full" />
                )}
              </button>
            ))}
          </div>

          <div className="p-6">
            {activeTab === "expense" && (
              <form onSubmit={handleAddExpense} className="space-y-6">
                {/* 快速輸入 */}
                <div className="flex flex-wrap gap-2">
                  {quickInputs.map((q) => (
                    <button
                      type="button"
                      key={q.id}
                      onClick={() => {
                        setFormName(q.name);
                        if (q.amount) setFormAmount(q.amount.toString());
                      }}
                      className="text-xs font-bold bg-slate-100 px-4 py-2 rounded-full border border-slate-200 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 transition-all"
                    >
                      {q.name}
                    </button>
                  ))}
                </div>

                {/* 日期選擇 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-black text-slate-500 uppercase flex items-center gap-2">
                      <Calendar className="w-3 h-3" /> 支出時間
                    </label>
                    <input
                      type={isMonthOnly ? "month" : "date"}
                      value={expenseDate}
                      onChange={(e) => setExpenseDate(e.target.value)}
                      className="p-2.5 border rounded-xl font-bold text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="flex items-center gap-2 mt-auto pb-1">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isMonthOnly}
                        onChange={(e) => setIsMonthOnly(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                      <span className="ml-2 text-xs font-bold text-slate-600">
                        只選月份 (如某月房租)
                      </span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-black text-slate-500 uppercase ml-1">
                      項目
                    </label>
                    <input
                      type="text"
                      required
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="項目名稱"
                      className="w-full p-3 border rounded-xl font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-black text-slate-500 uppercase ml-1">
                      金額
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-3.5 text-slate-400 font-bold">
                        $
                      </span>
                      <input
                        type="number"
                        required
                        value={formAmount}
                        onChange={(e) => setFormAmount(e.target.value)}
                        placeholder="0"
                        className="w-full p-3 pl-8 border rounded-xl font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl space-y-5 border border-slate-200 shadow-inner">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <label className="flex-1 flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 cursor-pointer transition-all hover:border-indigo-500">
                      <input
                        type="radio"
                        checked={payMethod === "shared"}
                        onChange={() => setPayMethod("shared")}
                        className="w-4 h-4 text-indigo-600"
                      />
                      <span className="font-black text-indigo-700 text-sm">
                        公費扣除 (三弟手上現金)
                      </span>
                    </label>
                    <label className="flex-1 flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 cursor-pointer transition-all hover:border-slate-500">
                      <input
                        type="radio"
                        checked={payMethod === "personal"}
                        onChange={() => setPayMethod("personal")}
                        className="w-4 h-4 text-slate-600"
                      />
                      <span className="font-black text-slate-600 text-sm">
                        個人代墊 (自掏腰包)
                      </span>
                    </label>
                  </div>

                  {payMethod === "personal" && (
                    <div className="pt-4 border-t border-slate-200 space-y-4 animate-in fade-in slide-in-from-top-2">
                      <div>
                        <div className="text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">
                          誰先出錢的？
                        </div>
                        <div className="flex gap-2">
                          {["big", "second", "third"].map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setFormPayer(p)}
                              className={`flex-1 py-2 rounded-lg border text-xs font-black transition-all ${
                                formPayer === p
                                  ? "bg-slate-800 text-white border-slate-800 shadow-md"
                                  : "bg-white text-slate-400 border-slate-200"
                              }`}
                            >
                              {getPersonName(p).split(" ")[0]}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">
                          這筆錢誰分攤？
                        </div>
                        <div className="flex gap-4">
                          {["big", "second", "third"].map((p) => (
                            <label
                              key={p}
                              className="flex items-center gap-2 text-xs font-black cursor-pointer text-slate-600"
                            >
                              <input
                                type="checkbox"
                                checked={formSharers[p]}
                                onChange={(e) =>
                                  setFormSharers((prev) => ({
                                    ...prev,
                                    [p]: e.target.checked,
                                  }))
                                }
                                className="w-4 h-4 rounded text-indigo-600"
                              />{" "}
                              {getPersonName(p).split(" ")[0]}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={syncStatus !== "synced"}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black shadow-lg shadow-indigo-100 transition-all active:scale-95 disabled:opacity-50"
                >
                  {syncStatus === "synced" ? "確認寫入紀錄" : "雲端同步中..."}
                </button>
              </form>
            )}

            {activeTab === "deposit" && (
              <form onSubmit={handleDeposit} className="space-y-6">
                <div className="bg-amber-50 p-5 border border-amber-200 rounded-2xl text-amber-800 text-xs leading-relaxed flex gap-3">
                  <div className="mt-1">
                    <AlertCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-black mb-1">存入公費責任額提醒：</div>
                    這會增加大哥、二哥的「需付責任」。
                    <br />
                    當大哥二哥實際給錢給三弟時，請用「個人代墊」功能記帳：
                    <b>大哥支付 / 三弟(公款)分攤</b>。
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase ml-1">
                    目標總額 (大哥二哥平分需付)
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-5 text-slate-400 font-bold text-xl">
                      $
                    </span>
                    <input
                      type="number"
                      required
                      placeholder="50000"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      className="w-full p-5 pl-10 border rounded-2xl text-3xl font-black outline-none focus:ring-2 focus:ring-emerald-500 shadow-inner"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black shadow-lg shadow-emerald-100 transition-all active:scale-95"
                >
                  確認建立責任額
                </button>
              </form>
            )}

            {activeTab === "logs" && (
              <div className="divide-y divide-slate-100 max-h-[450px] overflow-auto pr-2 custom-scrollbar">
                {logs.length === 0 ? (
                  <div className="py-20 text-center flex flex-col items-center gap-3">
                    <History className="w-10 h-10 text-slate-200" />
                    <span className="text-slate-400 font-bold text-sm">
                      目前尚無任何紀錄
                    </span>
                  </div>
                ) : (
                  logs.map((l) => (
                    <div
                      key={l.id}
                      className="py-4 flex justify-between items-start group"
                    >
                      <div className="flex-1">
                        <div className="text-[9px] text-slate-400 font-black mb-1 bg-slate-100 inline-block px-1.5 py-0.5 rounded uppercase tracking-tighter">
                          {l.date}
                        </div>
                        <div className="font-black text-slate-800 text-sm group-hover:text-indigo-600 transition-colors">
                          {l.desc}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1 font-medium">
                          {l.details}
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        <div className="text-lg font-black text-slate-900">
                          ${l.amount.toLocaleString()}
                        </div>
                        <button
                          onClick={async () => {
                            if (
                              window.confirm(
                                "確定刪除此紀錄？(此動作不影響帳戶金額，僅刪除日誌)"
                              )
                            ) {
                              await deleteDoc(
                                doc(
                                  db,
                                  "artifacts",
                                  appId,
                                  "public",
                                  "data",
                                  `${LEDGER_COLLECTION}_logs`,
                                  l.id
                                )
                              );
                            }
                          }}
                          className="text-[10px] text-rose-300 hover:text-rose-500 font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          刪除
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </section>

        {/* 底部提示 */}
        <p className="text-center text-[10px] text-slate-400 font-bold uppercase tracking-widest pb-10">
          Ma Brothers Virtual Ledger System • 2024 Stable
        </p>
      </main>

      {/* 手機版快速切換 Tab 樣式 (如有需要可自行擴展) */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default App;
