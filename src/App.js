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
  deleteDoc,
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
  User,
  CheckSquare,
  Square,
} from "lucide-react";

// ==========================================
// 🚀 Firebase 專屬配置
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
const LEDGER_NAME = "ma_brothers_ledger_v4";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

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
  const [formThirdSharesShared, setFormThirdSharesShared] = useState(false); // 新增：三弟是否分擔公費項目

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

  // --- 2. Firestore 雲端同步 ---
  useEffect(() => {
    if (!user) return;
    const stateRef = doc(
      db,
      "artifacts",
      appId,
      "public",
      "data",
      `${LEDGER_NAME}_state`,
      "main"
    );
    const logsRef = collection(
      db,
      "artifacts",
      appId,
      "public",
      "data",
      `${LEDGER_NAME}_logs`
    );

    const unsubState = onSnapshot(
      stateRef,
      (docSnap) => {
        if (docSnap.exists()) {
          setFunds(docSnap.data().funds);
          if (docSnap.data().quickInputs)
            setQuickInputs(docSnap.data().quickInputs);
        } else {
          setDoc(stateRef, { funds, quickInputs });
        }
        setSyncStatus("synced");
      },
      () => setSyncStatus("error")
    );

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

  const commitToCloud = async (newFunds, newLog = null) => {
    if (!user) return;
    setSyncStatus("connecting");
    try {
      const stateRef = doc(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        `${LEDGER_NAME}_state`,
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
          `${LEDGER_NAME}_logs`,
          logId
        );
        await setDoc(logRef, { ...newLog, timestamp: Date.now(), id: logId });
      }
      setSyncStatus("synced");
    } catch (e) {
      setSyncStatus("error");
    }
  };

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

  // --- 核心按鈕操作 ---
  const handleAddExpense = (e) => {
    e.preventDefault();
    if (!formName || !formAmount || isNaN(formAmount)) return;

    const amountNum = Number(formAmount);
    const dateLabel = getDisplayDate(expenseDate, isMonthOnly);
    const nextFunds = JSON.parse(JSON.stringify(funds));
    let logEntry = null;

    if (payMethod === "shared") {
      // --- 公費支出邏輯修正 ---
      let deductionForThird = 0;
      if (formThirdSharesShared) {
        deductionForThird = Math.round(amountNum / 3);
      }

      // 三弟的 Paid 增加 = 總支出 - 三弟自負額
      // 這樣三弟的結算會多扣這 1/3，代表他欠公費池的錢
      nextFunds.third.paid += amountNum - deductionForThird;

      logEntry = {
        date: dateLabel,
        type: "expense_shared",
        desc: `[公費] ${formName}`,
        amount: amountNum,
        details: `使用公費支付${
          formThirdSharesShared
            ? ` (三弟負擔 1/3: $${deductionForThird.toLocaleString()})`
            : ""
        }`,
      };
    } else {
      // 個人代墊邏輯
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
        type: "expense_personal",
        desc: `[個人] ${formName}`,
        amount: amountNum,
        details: `由 ${
          getPersonName(formPayer).split(" ")[0]
        } 支付，${names} 分擔`,
      };
    }

    commitToCloud(nextFunds, logEntry);
    setFormName("");
    setFormAmount("");
    setFormThirdSharesShared(false); // 重設狀態
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

    commitToCloud(nextFunds, {
      date: new Date().toLocaleDateString(),
      type: "deposit",
      desc: `存入公費責任額`,
      amount: amountNum,
      details: `建立公費目標，大哥二哥各需支付 ${half.toLocaleString()} 元`,
    });
    setDepositAmount("");
  };

  const handleSaveEdit = (person, type) => {
    const nextFunds = JSON.parse(JSON.stringify(funds));
    nextFunds[person][type] = Number(editAmount);
    commitToCloud(nextFunds, {
      date: new Date().toLocaleDateString(),
      type: "edit",
      desc: `手動校正數據`,
      amount: 0,
      details: `修正了 ${getPersonName(person)} 的金額項目`,
    });
    setEditingField(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-32">
      <header className="bg-slate-900 text-white p-4 shadow-md sticky top-0 z-20 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-500 rounded-lg shadow-inner">
            <Coins className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-black tracking-tight">馬家記帳 V4</h1>
        </div>
        <div className="flex items-center gap-3">
          {syncStatus === "synced" ? (
            <div className="flex items-center gap-1.5 text-[10px] bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full font-bold">
              <Cloud className="w-3.5 h-3.5" /> 雲端同步
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[10px] bg-amber-500/20 text-amber-400 px-3 py-1 rounded-full animate-pulse font-bold">
              <CloudOff className="w-3.5 h-3.5" /> 連線中
            </div>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-6 mt-4">
        {/* --- 帳戶面板 --- */}
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
                  <span className="font-bold text-sm flex items-center gap-2">
                    <User className="w-4 h-4 text-slate-400" />
                    {getPersonName(person)}
                  </span>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-white border border-slate-200">
                    {isThird ? "公費管理" : "出資人"}
                  </span>
                </div>
                <div className="p-4 space-y-4">
                  <div className="flex justify-between items-center text-xs">
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
                        className="w-20 border text-right font-bold outline-none ring-1 ring-blue-500"
                        autoFocus
                      />
                    ) : (
                      <span className="font-bold text-slate-700">
                        ${data.paid.toLocaleString()}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center text-xs">
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
                        className="w-20 border text-right font-bold outline-none ring-1 ring-rose-500"
                        autoFocus
                      />
                    ) : (
                      <span className="font-bold text-slate-700">
                        ${data.payable.toLocaleString()}
                      </span>
                    )}
                  </div>

                  <div
                    className={`p-4 rounded-2xl text-center shadow-inner ${
                      balance >= 0
                        ? "bg-indigo-50 text-indigo-700 border border-indigo-100"
                        : "bg-rose-50 text-rose-700 border border-rose-100"
                    }`}
                  >
                    <div className="text-[10px] font-black uppercase opacity-50 mb-1 tracking-widest">
                      個人收支結算
                    </div>
                    <div className="text-2xl font-black">
                      ${balance.toLocaleString()}
                    </div>
                    {isThird && (
                      <div className="text-[9px] mt-2 bg-yellow-400/20 text-yellow-800 p-1.5 rounded-lg font-black border border-yellow-200">
                        目前手持公費餘額：$
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
        <section className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden">
          <div className="flex border-b border-slate-100">
            {["expense", "deposit", "logs"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-4 text-xs font-black transition-all ${
                  activeTab === tab
                    ? "text-indigo-600 bg-white"
                    : "bg-slate-50/50 text-slate-400"
                }`}
              >
                {tab === "expense"
                  ? "記筆支出"
                  : tab === "deposit"
                  ? "存筆公費"
                  : "歷史紀錄"}
                {activeTab === tab && (
                  <div className="mx-auto mt-1 w-6 h-1 bg-indigo-600 rounded-full" />
                )}
              </button>
            ))}
          </div>

          <div className="p-6">
            {activeTab === "expense" && (
              <form onSubmit={handleAddExpense} className="space-y-6">
                <div className="flex flex-wrap gap-2">
                  {quickInputs.map((q) => (
                    <button
                      type="button"
                      key={q.id}
                      onClick={() => {
                        setFormName(q.name);
                        if (q.amount) setFormAmount(q.amount.toString());
                      }}
                      className="text-xs font-bold bg-slate-100 px-4 py-2 rounded-full border border-slate-200 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all"
                    >
                      {q.name}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-1.5">
                      <Calendar className="w-3 h-3" /> 支出日期/月份
                    </label>
                    <input
                      type={isMonthOnly ? "month" : "date"}
                      value={expenseDate}
                      onChange={(e) => setExpenseDate(e.target.value)}
                      className="p-3 border rounded-xl font-bold text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2 mt-auto pb-1">
                    <label className="relative inline-flex items-center cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={isMonthOnly}
                        onChange={(e) => setIsMonthOnly(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600 shadow-inner"></div>
                      <span className="ml-2 text-xs font-bold text-slate-500 group-hover:text-indigo-600 transition-colors">
                        只顯示月份 (某月房租)
                      </span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">
                      項目
                    </label>
                    <input
                      type="text"
                      required
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="如：一月房租"
                      className="w-full p-3.5 border rounded-2xl font-bold outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">
                      金額
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-4 text-slate-400 font-bold">
                        $
                      </span>
                      <input
                        type="number"
                        required
                        value={formAmount}
                        onChange={(e) => setFormAmount(e.target.value)}
                        placeholder="0"
                        className="w-full p-3.5 pl-9 border rounded-2xl font-bold outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 p-5 rounded-3xl space-y-5 border border-slate-200">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <label className="flex-1 flex flex-col gap-2 p-4 bg-white rounded-2xl border border-slate-200 cursor-pointer transition-all hover:border-indigo-500 group">
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          checked={payMethod === "shared"}
                          onChange={() => setPayMethod("shared")}
                          className="w-4 h-4 text-indigo-600"
                        />
                        <span className="font-black text-indigo-700 text-sm group-hover:text-indigo-600">
                          公費直接支付 (扣三弟現金)
                        </span>
                      </div>

                      {/* --- 三弟分擔按鈕 --- */}
                      {payMethod === "shared" && (
                        <div className="mt-3 ml-7 pt-3 border-t border-slate-100 animate-in fade-in slide-in-from-top-1">
                          <button
                            type="button"
                            onClick={() =>
                              setFormThirdSharesShared(!formThirdSharesShared)
                            }
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-black transition-all ${
                              formThirdSharesShared
                                ? "bg-indigo-600 border-indigo-600 text-white shadow-md"
                                : "bg-slate-50 border-slate-200 text-slate-400"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {formThirdSharesShared ? (
                                <CheckSquare className="w-4 h-4" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                              三弟(國郡)也須分擔 1/3
                            </div>
                            {formThirdSharesShared && formAmount && (
                              <span>
                                -$
                                {Math.round(
                                  Number(formAmount) / 3
                                ).toLocaleString()}
                              </span>
                            )}
                          </button>
                        </div>
                      )}
                    </label>
                    <label className="flex-1 flex items-center gap-3 p-4 bg-white rounded-2xl border border-slate-200 cursor-pointer transition-all hover:border-slate-500 group">
                      <input
                        type="radio"
                        checked={payMethod === "personal"}
                        onChange={() => setPayMethod("personal")}
                        className="w-4 h-4 text-slate-600"
                      />
                      <span className="font-black text-slate-600 text-sm group-hover:text-slate-900">
                        個人先行代墊
                      </span>
                    </label>
                  </div>

                  {payMethod === "personal" && (
                    <div className="pt-5 border-t border-slate-200 space-y-5 animate-in fade-in slide-in-from-top-2">
                      <div>
                        <div className="text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">
                          誰墊的錢？
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {["big", "second", "third"].map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setFormPayer(p)}
                              className={`py-2.5 rounded-xl border text-xs font-black transition-all ${
                                formPayer === p
                                  ? "bg-slate-900 text-white border-slate-900 shadow-lg"
                                  : "bg-white text-slate-400 border-slate-200 hover:border-slate-400"
                              }`}
                            >
                              {getPersonName(p).split(" ")[1]}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">
                          分擔人？
                        </div>
                        <div className="flex gap-4">
                          {["big", "second", "third"].map((p) => (
                            <label
                              key={p}
                              className="flex items-center gap-2 text-xs font-black cursor-pointer text-slate-600 hover:text-indigo-600 transition-colors"
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
                              {getPersonName(p).split(" ")[1]}
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
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[2rem] font-black shadow-xl shadow-indigo-100 transition-all active:scale-95 disabled:opacity-50 text-lg"
                >
                  {syncStatus === "synced" ? "寫入雲端紀錄" : "同步中..."}
                </button>
              </form>
            )}

            {activeTab === "deposit" && (
              <form onSubmit={handleDeposit} className="space-y-6">
                <div className="bg-amber-50 p-5 border border-amber-200 rounded-3xl text-amber-800 text-xs leading-relaxed flex gap-4 shadow-sm">
                  <div className="mt-1">
                    <AlertCircle className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <div className="font-black text-sm mb-1 uppercase tracking-tighter">
                      存入公費責任額提醒
                    </div>
                    此動作代表大哥二哥<b>未來</b>應支付的目標公費。
                    當實際給錢給三弟時，請用「個人代墊」功能：
                    <b>大哥支付 / 三弟分擔</b> 即可。
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase ml-2 tracking-widest">
                    公費目標總額 (英凱與培堯平分)
                  </label>
                  <div className="relative">
                    <span className="absolute left-5 top-6 text-slate-300 font-bold text-2xl">
                      $
                    </span>
                    <input
                      type="number"
                      required
                      placeholder="50000"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      className="w-full p-6 pl-12 border rounded-[2rem] text-4xl font-black outline-none focus:ring-2 focus:ring-emerald-500 shadow-inner"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full py-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[2rem] font-black shadow-xl shadow-emerald-100 transition-all active:scale-95 text-lg flex items-center justify-center gap-2"
                >
                  <PiggyBank className="w-6 h-6" /> 確認建立責任額
                </button>
              </form>
            )}

            {activeTab === "logs" && (
              <div className="divide-y divide-slate-100 max-h-[500px] overflow-auto pr-3 custom-scrollbar">
                {logs.length === 0 ? (
                  <div className="py-24 text-center flex flex-col items-center gap-4">
                    <History className="w-12 h-12 text-slate-100" />
                    <span className="text-slate-300 font-black text-sm uppercase tracking-widest">
                      目前帳本空空如也
                    </span>
                  </div>
                ) : (
                  logs.map((l) => (
                    <div
                      key={l.id}
                      className="py-5 flex justify-between items-start group"
                    >
                      <div className="flex-1">
                        <div className="text-[9px] text-slate-400 font-black mb-1.5 bg-slate-100 inline-block px-2 py-1 rounded uppercase tracking-tighter">
                          {l.date}
                        </div>
                        <div className="font-black text-slate-800 text-base group-hover:text-indigo-600 transition-colors">
                          {l.desc}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1 font-bold leading-relaxed">
                          {l.details}
                        </div>
                      </div>
                      <div className="text-right ml-4 flex flex-col items-end gap-1">
                        <div className="text-xl font-black text-slate-900 tracking-tighter">
                          ${l.amount.toLocaleString()}
                        </div>
                        <button
                          onClick={async () => {
                            if (
                              window.confirm("確定刪除此紀錄？此動作無法復原。")
                            ) {
                              await deleteDoc(
                                doc(
                                  db,
                                  "artifacts",
                                  appId,
                                  "public",
                                  "data",
                                  `${LEDGER_NAME}_logs`,
                                  l.id
                                )
                              );
                            }
                          }}
                          className="text-[9px] text-rose-300 hover:text-rose-500 font-black px-2 py-1 rounded hover:bg-rose-50 transition-all opacity-0 group-hover:opacity-100"
                        >
                          刪除紀錄
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </section>

        <p className="text-center text-[10px] text-slate-300 font-black uppercase tracking-[0.3em] py-12">
          Yilan Ma Brothers System • Stable v4
        </p>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
      `}</style>
    </div>
  );
};

export default App;
