import React, { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import {
  ReceiptText,
  History,
  Pencil,
  Check,
  X,
  ArrowRightLeft,
  Calendar,
  Cloud,
  CloudOff,
  User,
  CheckSquare,
  Square,
  Info,
  Calculator,
  Trash2,
  BookmarkPlus,
} from "lucide-react";

// ==========================================
// 🚀 Firebase 專屬配置 (yilan-99e2b)
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
const LEDGER_NAME = "ma_brothers_zerosum_v12"; // 升級至 v12 確保新的常用清單生效

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const BROTHERS = {
  big: { name: "大哥 英凱", color: "indigo" },
  second: { name: "二哥 培堯", color: "emerald" },
  third: { name: "三弟 國郡", color: "amber" },
};

const App = () => {
  const [user, setUser] = useState(null);
  const [syncStatus, setSyncStatus] = useState("connecting");

  // 核心數據：零和結算 (Sum = 0)
  // (+) 正數 = 應收回 (代墊、預付給別人)
  // (-) 負數 = 須支付 (欠款、拿了別人的錢)
  const [balances, setBalances] = useState({ big: 0, second: 0, third: 0 });

  // 豐富的預設常用清單
  const [quickInputs, setQuickInputs] = useState([
    { id: 1, name: "房租", amount: 9000 },
    { id: 2, name: "NETFLIX", amount: 390 },
    { id: 3, name: "水費", amount: "" },
    { id: 4, name: "電費", amount: "" },
    { id: 5, name: "瓦斯費", amount: "" },
    { id: 6, name: "聚餐", amount: "" },
    { id: 7, name: "停車費", amount: "" },
    { id: 8, name: "日用品", amount: "" },
  ]);
  const [logs, setLogs] = useState([]);

  // UI 狀態
  const [activeTab, setActiveTab] = useState("expense");

  // 支出表單
  const [formName, setFormName] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formPayer, setFormPayer] = useState("third"); // 預設三弟付
  const [formSharers, setFormSharers] = useState({
    big: true,
    second: true,
    third: false,
  }); // 預設大哥二哥分擔
  const [saveAsQuick, setSaveAsQuick] = useState(false); // 新增：是否存為常用

  // 轉帳表單
  const [transferFrom, setTransferFrom] = useState("big");
  const [transferTo, setTransferTo] = useState("third");
  const [transferAmount, setTransferAmount] = useState("");

  const [expenseDate, setExpenseDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [isMonthOnly, setIsMonthOnly] = useState(false);

  const [editingPerson, setEditingPerson] = useState(null);
  const [editValue, setEditValue] = useState("");

  // --- 1. Firebase 驗證 ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (e) {
        setSyncStatus("error");
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // --- 2. Firestore 同步 ---
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
          const cloudData = docSnap.data();
          if (cloudData && cloudData.balances) setBalances(cloudData.balances);
          if (cloudData && cloudData.quickInputs)
            setQuickInputs(cloudData.quickInputs);
        } else {
          setDoc(stateRef, { balances, quickInputs });
        }
        setSyncStatus("synced");
      },
      () => setSyncStatus("error")
    );

    const unsubLogs = onSnapshot(logsRef, (snapshot) => {
      const list = [];
      snapshot.forEach((d) => list.push({ ...d.data(), id: d.id }));
      list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setLogs(list.slice(0, 50));
    });

    return () => {
      unsubState();
      unsubLogs();
    };
  }, [user]);

  // 修改 commitData 以支援同時更新 quickInputs
  const commitData = async (
    newBalances,
    newLog = null,
    newQuickInputs = quickInputs
  ) => {
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
      await setDoc(
        stateRef,
        { balances: newBalances, quickInputs: newQuickInputs },
        { merge: true }
      );
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

  const getDisplayDate = (dateStr, monthOnly) => {
    if (!dateStr) return "";
    if (monthOnly) {
      const [year, month] = dateStr.split("-");
      return `${year}年${month}月`;
    }
    return dateStr;
  };

  // 快速選擇分擔者
  const setSplitMode = (mode) => {
    if (mode === "two") {
      setFormSharers({ big: true, second: true, third: false });
    } else if (mode === "three") {
      setFormSharers({ big: true, second: true, third: true });
    }
  };

  // 刪除常用項目
  const handleDeleteQuickInput = (id) => {
    if (!window.confirm("確定要移除此常用項目嗎？")) return;
    const nextQuickInputs = quickInputs.filter((q) => q.id !== id);
    setQuickInputs(nextQuickInputs); // Optimistic update
    commitData(balances, null, nextQuickInputs);
  };

  // --- 核心邏輯 1：記支出 ---
  const handleAddExpense = (e) => {
    e.preventDefault();
    const amt = Number(formAmount);
    if (!formName || isNaN(amt) || amt <= 0) return;

    const activeSharers = Object.entries(formSharers)
      .filter(([_, isShared]) => isShared)
      .map(([id]) => id);
    if (activeSharers.length === 0) {
      alert("請至少選擇一位分擔者！");
      return;
    }

    const dateLabel = getDisplayDate(expenseDate, isMonthOnly);
    const nextBalances = JSON.parse(JSON.stringify(balances));

    // 1. 付錢的人：餘額 [+]
    nextBalances[formPayer] += amt;

    // 2. 分擔的人：餘額 [-]
    let totalDeducted = 0;
    activeSharers.forEach((id, index) => {
      let shareAmt = Math.round(amt / activeSharers.length);
      if (index === activeSharers.length - 1) {
        shareAmt = amt - totalDeducted;
      }
      nextBalances[id] -= shareAmt;
      totalDeducted += shareAmt;
    });

    const sharerNames = activeSharers
      .map((id) => BROTHERS[id].name.split(" ")[1])
      .join("、");

    // 3. 處理儲存為常用項目
    let nextQuickInputs = [...quickInputs];
    if (saveAsQuick) {
      const existsIdx = nextQuickInputs.findIndex((q) => q.name === formName);
      if (existsIdx >= 0) {
        nextQuickInputs[existsIdx].amount = amt; // 更新已存在的金額
      } else {
        nextQuickInputs.push({ id: Date.now(), name: formName, amount: amt }); // 新增
      }
    }

    commitData(
      nextBalances,
      {
        date: dateLabel,
        type: "expense",
        desc: formName,
        amount: amt,
        details: `${
          BROTHERS[formPayer].name.split(" ")[1]
        } 支付。由 ${sharerNames} 分擔。`,
      },
      nextQuickInputs
    );

    setFormName("");
    setFormAmount("");
    setSaveAsQuick(false);
  };

  // --- 核心邏輯 2：預付/轉帳/還款 ---
  const handleTransfer = (e) => {
    e.preventDefault();
    const amt = Number(transferAmount);
    if (isNaN(amt) || amt <= 0) return;
    if (transferFrom === transferTo) return;

    const nextBalances = JSON.parse(JSON.stringify(balances));

    // 拿出錢的人：餘額 [+]
    nextBalances[transferFrom] += amt;
    // 收到錢的人：餘額 [-]
    nextBalances[transferTo] -= amt;

    commitData(nextBalances, {
      date: new Date().toLocaleDateString(),
      type: "transfer",
      desc: "資金移轉 (給現金)",
      amount: amt,
      details: `${BROTHERS[transferFrom].name.split(" ")[1]} 將現金交給 ${
        BROTHERS[transferTo].name.split(" ")[1]
      }`,
    });
    setTransferAmount("");
  };

  const handleSaveEdit = (person) => {
    const nextBalances = JSON.parse(JSON.stringify(balances));
    nextBalances[person] = Number(editValue);

    commitData(nextBalances, {
      date: new Date().toLocaleDateString(),
      type: "edit",
      desc: "強制校正餘額",
      amount: 0,
      details: `手動修改了 ${BROTHERS[person].name.split(" ")[1]} 的結算金額`,
    });
    setEditingPerson(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-32">
      <header className="bg-slate-900 text-white p-5 shadow-lg sticky top-0 z-20 flex justify-between items-center border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-xl">
            <Calculator className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight leading-none">
              兄弟記帳清算
            </h1>
            <p className="text-[10px] text-slate-400 font-bold mt-1 tracking-widest uppercase">
              零和算法 v12
            </p>
          </div>
        </div>
        <div>
          {syncStatus === "synced" ? (
            <div className="flex items-center gap-1.5 text-[9px] bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full font-black">
              <Cloud className="w-3 h-3" /> 已同步
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[9px] bg-amber-500/20 text-amber-400 px-3 py-1 rounded-full animate-pulse font-black">
              <CloudOff className="w-3 h-3" /> 連線中
            </div>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-6 mt-2">
        {/* --- 結算面板 --- */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(BROTHERS).map(([id, info]) => {
            const bal = balances[id];
            const isOwed = bal > 0;
            const isOwe = bal < 0;

            return (
              <div
                key={id}
                className={`bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden relative transition-all hover:shadow-md ring-2 ${
                  isOwed
                    ? "ring-indigo-500/20"
                    : isOwe
                    ? "ring-rose-500/20"
                    : "ring-transparent"
                }`}
              >
                <div className={`h-1.5 w-full bg-${info.color}-500`} />
                <div className="p-5 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="font-black text-base text-slate-800 flex items-center gap-2">
                      <User className="w-4 h-4 text-slate-400" />
                      {info.name.split(" ")[1]}
                    </span>
                    <button
                      onClick={() => {
                        setEditingPerson(id);
                        setEditValue(bal);
                      }}
                      className="p-1"
                    >
                      <Pencil className="w-3 h-3 text-slate-300 hover:text-blue-600" />
                    </button>
                  </div>

                  {editingPerson === id ? (
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => handleSaveEdit(id)}
                        className="w-full border rounded font-black text-center text-lg outline-none ring-2 ring-blue-500 py-2"
                        autoFocus
                      />
                    </div>
                  ) : (
                    <div
                      className={`p-4 rounded-2xl text-center shadow-inner ${
                        isOwed
                          ? "bg-indigo-50 text-indigo-700"
                          : isOwe
                          ? "bg-rose-50 text-rose-700"
                          : "bg-slate-50 text-slate-400"
                      }`}
                    >
                      <div className="text-[10px] font-black uppercase opacity-60 mb-1 tracking-widest">
                        目前淨餘額
                      </div>
                      <div className="text-3xl font-black">
                        {isOwed ? "+" : ""}
                        {bal.toLocaleString()}
                      </div>
                      <div
                        className={`text-[10px] mt-2 font-black py-1 px-2 rounded-lg inline-block ${
                          isOwed
                            ? "bg-indigo-100 text-indigo-800"
                            : isOwe
                            ? "bg-rose-100 text-rose-800"
                            : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {isOwed
                          ? "💰 應收回 (預付款)"
                          : isOwe
                          ? "⚠️ 須支付 (欠款)"
                          : "✅ 帳目結清"}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        {/* --- 操作面板 --- */}
        <section className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden mt-6">
          <div className="flex border-b border-slate-100 bg-slate-50/30">
            {["expense", "transfer", "logs"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-5 text-[11px] font-black transition-all ${
                  activeTab === tab
                    ? "text-blue-600 bg-white shadow-sm"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                {tab === "expense"
                  ? "記一筆支出"
                  : tab === "transfer"
                  ? "給現金/預付"
                  : "歷史紀錄"}
                {activeTab === tab && (
                  <div className="mx-auto mt-1 w-5 h-1 bg-blue-600 rounded-full" />
                )}
              </button>
            ))}
          </div>

          <div className="p-6">
            {/* TAB: 記支出 */}
            {activeTab === "expense" && (
              <form onSubmit={handleAddExpense} className="space-y-6">
                {/* 快速項目 (更新版：可刪除) */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 ml-1 flex items-center gap-1">
                    <BookmarkPlus className="w-3 h-3" /> 快速帶入：
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {quickInputs.map((q) => (
                      <div
                        key={q.id}
                        className="inline-flex items-stretch bg-slate-50 border border-slate-200 rounded-full shadow-sm hover:border-blue-400 transition-all group overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setFormName(q.name);
                            if (q.amount) setFormAmount(q.amount.toString());
                          }}
                          className="text-[10px] font-black px-3 py-2 hover:bg-blue-600 hover:text-white transition-all text-slate-700"
                        >
                          {q.name} {q.amount ? `($${q.amount})` : ""}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteQuickInput(q.id)}
                          className="px-2 border-l border-slate-200 text-slate-300 hover:bg-rose-500 hover:text-white hover:border-rose-500 transition-all flex items-center justify-center"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200/50 shadow-inner">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-1.5 ml-1">
                      <Calendar className="w-3 h-3" /> 支出時間
                    </label>
                    <input
                      type={isMonthOnly ? "month" : "date"}
                      value={expenseDate}
                      onChange={(e) => setExpenseDate(e.target.value)}
                      className="p-3 border rounded-xl font-black text-xs bg-white outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2 mt-auto pb-1 ml-1">
                    <label className="relative inline-flex items-center cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={isMonthOnly}
                        onChange={(e) => setIsMonthOnly(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                      <span className="ml-3 text-[10px] font-black text-slate-500 group-hover:text-blue-600">
                        只選月份
                      </span>
                    </label>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 ml-1">
                        項目名稱
                      </label>
                      <input
                        type="text"
                        required
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        placeholder="如：二月房租"
                        className="w-full p-4 border rounded-2xl font-black text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 ml-1">
                        總金額
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-4 text-slate-300 font-black text-sm">
                          $
                        </span>
                        <input
                          type="number"
                          required
                          value={formAmount}
                          onChange={(e) => setFormAmount(e.target.value)}
                          placeholder="0"
                          className="w-full p-4 pl-8 border rounded-2xl font-black text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 新增儲存常用選項 */}
                  <label className="flex items-center gap-2 cursor-pointer ml-2 w-max group">
                    <input
                      type="checkbox"
                      checked={saveAsQuick}
                      onChange={(e) => setSaveAsQuick(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                    />
                    <span className="text-[11px] font-bold text-slate-500 group-hover:text-blue-600 transition-colors">
                      📝 將此項目與金額儲存為「常用預設」
                    </span>
                  </label>
                </div>

                <div className="bg-slate-50 p-5 rounded-3xl space-y-6 border border-slate-200 shadow-inner">
                  <div>
                    <div className="text-[10px] font-black text-slate-400 mb-3 uppercase tracking-widest ml-1">
                      這筆錢是誰付的？ (代墊者)
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {Object.keys(BROTHERS).map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setFormPayer(id)}
                          className={`py-3 rounded-xl border text-[11px] font-black transition-all ${
                            formPayer === id
                              ? "bg-slate-800 text-white border-slate-800 shadow-md"
                              : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          {BROTHERS[id].name.split(" ")[1]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-5 border-t border-slate-200">
                    <div className="flex justify-between items-end mb-3 ml-1">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        這筆錢誰要分擔？
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setSplitMode("two")}
                          className="text-[9px] font-black bg-white border border-slate-200 px-2 py-1 rounded hover:bg-slate-100"
                        >
                          大二哥
                        </button>
                        <button
                          type="button"
                          onClick={() => setSplitMode("three")}
                          className="text-[9px] font-black bg-white border border-slate-200 px-2 py-1 rounded hover:bg-slate-100"
                        >
                          三人平分
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {Object.keys(BROTHERS).map((id) => (
                        <label
                          key={id}
                          className={`flex items-center justify-center gap-2 py-3 rounded-xl border cursor-pointer transition-all ${
                            formSharers[id]
                              ? "bg-indigo-50 border-indigo-200 text-indigo-700 font-black shadow-sm"
                              : "bg-white border-slate-200 text-slate-400 font-bold"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={formSharers[id]}
                            onChange={(e) =>
                              setFormSharers((prev) => ({
                                ...prev,
                                [id]: e.target.checked,
                              }))
                            }
                            className="hidden"
                          />
                          <div
                            className={`w-3 h-3 rounded flex items-center justify-center ${
                              formSharers[id] ? "bg-indigo-600" : "bg-slate-200"
                            }`}
                          >
                            {formSharers[id] && (
                              <Check className="w-2 h-2 text-white" />
                            )}
                          </div>
                          {BROTHERS[id].name.split(" ")[1]}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={syncStatus !== "synced"}
                  className="w-full py-5 bg-blue-600 hover:bg-blue-700 text-white rounded-[2rem] font-black shadow-xl shadow-blue-200 transition-all active:scale-[0.98] text-base"
                >
                  確認寫入支出
                </button>
              </form>
            )}

            {/* TAB: 給現金 / 轉帳 */}
            {activeTab === "transfer" && (
              <form onSubmit={handleTransfer} className="space-y-6">
                <div className="bg-emerald-50 p-5 border border-emerald-200 rounded-3xl text-emerald-800 text-[11px] leading-relaxed flex gap-4 shadow-sm font-bold">
                  <ArrowRightLeft className="w-6 h-6 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-black text-sm mb-1 uppercase tracking-tighter">
                      預付 / 還款 / 給現金
                    </div>
                    拿出現金的人，餘額會增加 (變正)；
                    <br />
                    收到現金的人，餘額會減少 (變負)。
                  </div>
                </div>

                <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-200 shadow-inner space-y-6">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 mb-3 block ml-1 uppercase tracking-widest">
                      誰拿出現金？ (餘額增加)
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {Object.keys(BROTHERS).map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setTransferFrom(id)}
                          className={`py-3 rounded-xl border text-[11px] font-black transition-all ${
                            transferFrom === id
                              ? "bg-slate-800 text-white border-slate-800 shadow-md"
                              : "bg-white text-slate-500 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {BROTHERS[id].name.split(" ")[1]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-slate-400 mb-3 block ml-1 uppercase tracking-widest">
                      誰收到現金？ (餘額減少)
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {Object.keys(BROTHERS).map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setTransferTo(id)}
                          className={`py-3 rounded-xl border text-[11px] font-black transition-all ${
                            transferTo === id
                              ? "bg-indigo-600 text-white border-indigo-600 shadow-md"
                              : "bg-white text-slate-500 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {BROTHERS[id].name.split(" ")[1]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200/60">
                    <label className="text-[10px] font-black text-slate-400 ml-1 uppercase tracking-widest mb-3 block">
                      轉交金額
                    </label>
                    <div className="relative">
                      <span className="absolute left-5 top-5 text-slate-300 font-black text-2xl">
                        $
                      </span>
                      <input
                        type="number"
                        required
                        placeholder="0"
                        value={transferAmount}
                        onChange={(e) => setTransferAmount(e.target.value)}
                        className="w-full p-6 pl-12 border rounded-2xl text-3xl font-black outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[2rem] font-black shadow-xl shadow-emerald-200 transition-all active:scale-[0.98] text-base flex items-center justify-center gap-3"
                >
                  <Check className="w-6 h-6" /> 確認交付紀錄
                </button>
              </form>
            )}

            {/* TAB: 紀錄 */}
            {activeTab === "logs" && (
              <div className="divide-y divide-slate-100 max-h-[500px] overflow-auto pr-3 custom-scrollbar">
                {logs.length === 0 ? (
                  <div className="py-32 text-center flex flex-col items-center gap-4 opacity-30">
                    <History className="w-16 h-16 text-slate-300" />
                    <span className="text-slate-500 font-black text-xs uppercase tracking-[0.4em]">
                      暫無紀錄
                    </span>
                  </div>
                ) : (
                  logs.map((l) => (
                    <div
                      key={l.id}
                      className="py-5 flex justify-between items-start group"
                    >
                      <div className="flex-1 space-y-1">
                        <div className="text-[8px] text-slate-400 font-black bg-slate-100 inline-block px-2 py-0.5 rounded-md uppercase tracking-wider">
                          {l.date}
                        </div>
                        <div className="font-black text-slate-800 text-[15px] group-hover:text-blue-600 transition-colors leading-tight font-black">
                          {l.desc}
                        </div>
                        <div className="text-[10px] text-slate-400 font-bold leading-relaxed">
                          {l.details}
                        </div>
                      </div>
                      <div className="text-right ml-4 flex flex-col items-end gap-1 shrink-0">
                        <div
                          className={`text-xl font-black tracking-tighter ${
                            l.type === "transfer"
                              ? "text-emerald-600"
                              : "text-slate-900"
                          }`}
                        >
                          ${(l.amount || 0).toLocaleString()}
                        </div>
                        <button
                          onClick={async () => {
                            if (
                              window.confirm(
                                "確定刪除此紀錄？(僅刪除日誌，不回溯面板金額)"
                              )
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
                          className="text-[9px] text-rose-300 hover:text-rose-500 font-black px-2 py-1 rounded-md hover:bg-rose-50 transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </section>

        <p className="text-center text-[10px] text-slate-300 font-black uppercase tracking-[0.35em] py-16">
          Ma Brothers System • Zero-Sum Ledger v12
        </p>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
      `}</style>
    </div>
  );
};

export default App;
