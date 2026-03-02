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
  Undo2,
  AlertTriangle,
  Handshake,
  PartyPopper,
  CheckCircle2,
  Layers,
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
const LEDGER_NAME = "ma_brothers_zerosum_v13"; // 維持 v13，無縫升級

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

  // 核心數據
  const [balances, setBalances] = useState({ big: 0, second: 0, third: 0 });
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
  const [formName, setFormName] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formPayer, setFormPayer] = useState("third");
  const [formSharers, setFormSharers] = useState({
    big: true,
    second: true,
    third: false,
  });
  const [saveAsQuick, setSaveAsQuick] = useState(false);

  const [transferFrom, setTransferFrom] = useState("big");
  const [transferTo, setTransferTo] = useState("third");
  const [transferAmount, setTransferAmount] = useState("");

  // 單筆日期 / 批量多月 狀態
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [expenseDate, setExpenseDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [isMonthOnly, setIsMonthOnly] = useState(false);

  const currentMonthStr = new Date().toISOString().slice(0, 7); // YYYY-MM
  const [batchStartMonth, setBatchStartMonth] = useState(currentMonthStr);
  const [batchEndMonth, setBatchEndMonth] = useState(currentMonthStr);

  const [editingPerson, setEditingPerson] = useState(null);
  const [editValue, setEditValue] = useState("");

  // 刪除確認 & 結算 Modal 狀態
  const [deleteDialog, setDeleteDialog] = useState({
    isOpen: false,
    log: null,
  });
  const [showSettleModal, setShowSettleModal] = useState(false);

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

  // 改寫 commitData 以支援同時寫入多筆 Logs (批量輸入用)
  const commitData = async (
    newBalances,
    newLogs = null,
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

      if (newLogs) {
        const logsArray = Array.isArray(newLogs) ? newLogs : [newLogs];
        const promises = logsArray.map((log, index) => {
          const logId = Date.now().toString() + "_" + index; // 加 index 避免 ID 衝突
          const logRef = doc(
            db,
            "artifacts",
            appId,
            "public",
            "data",
            `${LEDGER_NAME}_logs`,
            logId
          );
          return setDoc(logRef, {
            ...log,
            timestamp: Date.now() + index,
            id: logId,
          });
        });
        await Promise.all(promises);
      }
      setSyncStatus("synced");
    } catch (e) {
      setSyncStatus("error");
    }
  };

  const getDisplayDate = (dateStr, monthOnly) => {
    if (!dateStr) return "";
    // 如果傳入的是 YYYY-MM 格式，強制當作 monthOnly 處理
    if (dateStr.length === 7 || monthOnly) {
      const [year, month] = dateStr.split("-");
      return `${year}年${month}月`;
    }
    return dateStr;
  };

  const setSplitMode = (mode) => {
    if (mode === "two") {
      setFormSharers({ big: true, second: true, third: false });
    } else if (mode === "three") {
      setFormSharers({ big: true, second: true, third: true });
    }
  };

  const handleDeleteQuickInput = (id) => {
    if (!window.confirm("確定要移除此常用項目嗎？")) return;
    const nextQuickInputs = quickInputs.filter((q) => q.id !== id);
    setQuickInputs(nextQuickInputs);
    commitData(balances, null, nextQuickInputs);
  };

  const calculateChanges = (oldBals, newBals) => {
    return {
      big: newBals.big - oldBals.big,
      second: newBals.second - oldBals.second,
      third: newBals.third - oldBals.third,
    };
  };

  // 取得起訖月份之間的所有月份字串 (YYYY-MM)
  const getMonthsInRange = (startStr, endStr) => {
    const dates = [];
    let [sYear, sMonth] = startStr.split("-").map(Number);
    const [eYear, eMonth] = endStr.split("-").map(Number);

    while (sYear < eYear || (sYear === eYear && sMonth <= eMonth)) {
      dates.push(`${sYear}-${String(sMonth).padStart(2, "0")}`);
      sMonth++;
      if (sMonth > 12) {
        sMonth = 1;
        sYear++;
      }
    }
    return dates;
  };

  // --- 核心邏輯 1：記支出 (支援批量) ---
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

    let monthsToProcess = [];
    if (isBatchMode) {
      if (
        !batchStartMonth ||
        !batchEndMonth ||
        batchStartMonth > batchEndMonth
      ) {
        alert("開始月份不能晚於結束月份！請重新選擇。");
        return;
      }
      monthsToProcess = getMonthsInRange(batchStartMonth, batchEndMonth);
    } else {
      monthsToProcess = [expenseDate]; // 單筆模式，陣列只裝一天
    }

    const nextBalances = JSON.parse(JSON.stringify(balances));
    const logsToCreate = [];

    // 針對每一個月份/日期，循序計算餘額並產生 Log
    monthsToProcess.forEach((dateStr) => {
      const prevBalances = { ...nextBalances }; // 紀錄計算此筆「之前」的狀態

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
      const balanceChanges = calculateChanges(prevBalances, nextBalances);

      // 如果是批量模式，日期直接顯示該月份，並在項目後方加上月份標籤
      const displayDate = isBatchMode
        ? getDisplayDate(dateStr, true)
        : getDisplayDate(dateStr, isMonthOnly);
      const finalDesc = isBatchMode ? `${formName} (${displayDate})` : formName;

      logsToCreate.push({
        date: displayDate,
        type: "expense",
        desc: finalDesc,
        amount: amt,
        details: `${
          BROTHERS[formPayer].name.split(" ")[1]
        } 支付。由 ${sharerNames} 分擔。`,
        previousBalances: prevBalances,
        balanceChanges: balanceChanges,
      });
    });

    let nextQuickInputs = [...quickInputs];
    if (saveAsQuick) {
      const existsIdx = nextQuickInputs.findIndex((q) => q.name === formName);
      if (existsIdx >= 0) nextQuickInputs[existsIdx].amount = amt;
      else
        nextQuickInputs.push({ id: Date.now(), name: formName, amount: amt });
    }

    commitData(nextBalances, logsToCreate, nextQuickInputs);

    // 重置表單
    setFormName("");
    setFormAmount("");
    setSaveAsQuick(false);
  };

  // --- 核心邏輯 2：預付/轉帳 ---
  const handleTransfer = (e) => {
    e.preventDefault();
    const amt = Number(transferAmount);
    if (isNaN(amt) || amt <= 0 || transferFrom === transferTo) return;

    const prevBalances = { ...balances };
    const nextBalances = { ...balances };

    nextBalances[transferFrom] += amt;
    nextBalances[transferTo] -= amt;

    const balanceChanges = calculateChanges(prevBalances, nextBalances);

    commitData(nextBalances, {
      date: new Date().toLocaleDateString(),
      type: "transfer",
      desc: "資金移轉 (給現金)",
      amount: amt,
      details: `${BROTHERS[transferFrom].name.split(" ")[1]} 將現金交給 ${
        BROTHERS[transferTo].name.split(" ")[1]
      }`,
      previousBalances: prevBalances,
      balanceChanges: balanceChanges,
    });
    setTransferAmount("");
  };

  // --- 核心邏輯 3：手動校正 ---
  const handleSaveEdit = (person) => {
    const prevBalances = { ...balances };
    const nextBalances = { ...balances };
    nextBalances[person] = Number(editValue);

    const balanceChanges = calculateChanges(prevBalances, nextBalances);

    commitData(nextBalances, {
      date: new Date().toLocaleDateString(),
      type: "edit",
      desc: "強制校正餘額",
      amount: 0,
      details: `手動修改了 ${BROTHERS[person].name.split(" ")[1]} 的結算金額`,
      previousBalances: prevBalances,
      balanceChanges: balanceChanges,
    });
    setEditingPerson(null);
  };

  // --- 結算演算法 ---
  const calculateSettlement = () => {
    let debtors = [];
    let creditors = [];

    Object.entries(balances).forEach(([id, bal]) => {
      if (bal < 0) debtors.push({ id, amount: Math.abs(bal) });
      else if (bal > 0) creditors.push({ id, amount: bal });
    });

    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    let transactions = [];
    let i = 0,
      j = 0;

    while (i < debtors.length && j < creditors.length) {
      let debtor = debtors[i];
      let creditor = creditors[j];

      let settleAmount = Math.min(debtor.amount, creditor.amount);
      transactions.push({
        from: debtor.id,
        to: creditor.id,
        amount: settleAmount,
      });

      debtor.amount -= settleAmount;
      creditor.amount -= settleAmount;

      if (debtor.amount === 0) i++;
      if (creditor.amount === 0) j++;
    }

    return transactions;
  };

  const handleSettleAll = () => {
    const prevBalances = { ...balances };
    const nextBalances = { big: 0, second: 0, third: 0 };
    const balanceChanges = calculateChanges(prevBalances, nextBalances);

    commitData(nextBalances, {
      date: new Date().toLocaleDateString(),
      type: "settle",
      desc: "🎉 結清所有款項並歸零",
      amount: 0,
      details: "所有人的帳務已結清",
      previousBalances: prevBalances,
      balanceChanges: balanceChanges,
    });

    setShowSettleModal(false);
  };

  // --- 復原與刪除 ---
  const handleUndoLast = async () => {
    if (logs.length === 0) return;
    const latestLog = logs[0];

    if (!latestLog.previousBalances) {
      alert("這筆是舊版紀錄，無法直接復原。請用手動校正或單筆回溯刪除。");
      return;
    }

    if (
      window.confirm(
        `確定要取消上一筆動作【${latestLog.desc}】嗎？\n金額會完全回到動作發生前的狀態。`
      )
    ) {
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
          { balances: latestLog.previousBalances, quickInputs },
          { merge: true }
        );

        await deleteDoc(
          doc(
            db,
            "artifacts",
            appId,
            "public",
            "data",
            `${LEDGER_NAME}_logs`,
            latestLog.id
          )
        );
        setSyncStatus("synced");
      } catch (e) {
        setSyncStatus("error");
      }
    }
  };

  const handleConfirmDelete = async (shouldRollback) => {
    const log = deleteDialog.log;
    if (!log) return;

    setSyncStatus("connecting");
    try {
      if (shouldRollback && log.balanceChanges) {
        const nextBalances = { ...balances };
        Object.keys(log.balanceChanges).forEach((person) => {
          nextBalances[person] -= log.balanceChanges[person];
        });

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
          { balances: nextBalances, quickInputs },
          { merge: true }
        );
      }

      await deleteDoc(
        doc(
          db,
          "artifacts",
          appId,
          "public",
          "data",
          `${LEDGER_NAME}_logs`,
          log.id
        )
      );
      setSyncStatus("synced");
    } catch (e) {
      setSyncStatus("error");
    }
    setDeleteDialog({ isOpen: false, log: null });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-32 relative">
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
              零和算法 v13 Batch
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

        {/* --- 結算清帳按鈕 --- */}
        <div className="mt-5 mb-2 flex justify-center">
          <button
            onClick={() => setShowSettleModal(true)}
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3.5 px-8 rounded-2xl shadow-lg shadow-indigo-200 transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <Handshake className="w-5 h-5" />
            查看結清還款計畫並歸零
          </button>
        </div>

        {/* --- 操作面板 --- */}
        <section className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden mt-4">
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
                {/* 快速項目 */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 ml-1 flex items-center gap-1">
                    <BookmarkPlus className="w-3 h-3" /> 點擊快速帶入：
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

                {/* 輸入模式切換與日期選擇 */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/50 shadow-inner space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                    <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-1.5 ml-1">
                      <Calendar className="w-3 h-3" /> 支出時間設定
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setIsBatchMode(false)}
                        className={`text-[10px] font-black px-3 py-1.5 rounded-lg transition-all ${
                          !isBatchMode
                            ? "bg-blue-600 text-white shadow-sm"
                            : "bg-slate-200 text-slate-500"
                        }`}
                      >
                        單筆輸入
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsBatchMode(true)}
                        className={`text-[10px] font-black px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
                          isBatchMode
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "bg-slate-200 text-slate-500"
                        }`}
                      >
                        <Layers className="w-3 h-3" /> 批量多月
                      </button>
                    </div>
                  </div>

                  {isBatchMode ? (
                    // 批量多月模式
                    <div className="flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                      <div className="flex-1 space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400">
                          開始月份
                        </label>
                        <input
                          type="month"
                          value={batchStartMonth}
                          onChange={(e) => setBatchStartMonth(e.target.value)}
                          className="w-full p-3 border rounded-xl font-black text-xs bg-white outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                        />
                      </div>
                      <div className="text-slate-400 font-black mt-5">至</div>
                      <div className="flex-1 space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400">
                          結束月份
                        </label>
                        <input
                          type="month"
                          value={batchEndMonth}
                          onChange={(e) => setBatchEndMonth(e.target.value)}
                          className="w-full p-3 border rounded-xl font-black text-xs bg-white outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                        />
                      </div>
                    </div>
                  ) : (
                    // 單筆輸入模式
                    <div className="flex items-end gap-3 animate-in fade-in">
                      <div className="flex-1 space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400">
                          日期
                        </label>
                        <input
                          type={isMonthOnly ? "month" : "date"}
                          value={expenseDate}
                          onChange={(e) => setExpenseDate(e.target.value)}
                          className="w-full p-3 border rounded-xl font-black text-xs bg-white outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                        />
                      </div>
                      <div className="flex items-center gap-2 pb-3 pl-2">
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
                  )}
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
                        {isBatchMode ? "每月產生金額" : "總金額"}
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
                  {isBatchMode ? "確認批次寫入多筆紀錄" : "確認寫入支出"}
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
              <div className="flex flex-col h-full">
                {/* 復原最新一筆按鈕 */}
                {logs.length > 0 && logs[0].previousBalances && (
                  <div className="mb-4">
                    <button
                      onClick={handleUndoLast}
                      className="w-full bg-slate-800 hover:bg-slate-900 text-white text-[11px] font-black py-3 rounded-xl flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.98]"
                    >
                      <Undo2 className="w-4 h-4" /> 復原上一筆動作：
                      {logs[0].desc}
                    </button>
                  </div>
                )}

                <div className="divide-y divide-slate-100 max-h-[500px] overflow-auto pr-3 custom-scrollbar">
                  {logs.length === 0 ? (
                    <div className="py-32 text-center flex flex-col items-center gap-4 opacity-30">
                      <History className="w-16 h-16 text-slate-300" />
                      <span className="text-slate-500 font-black text-xs uppercase tracking-[0.4em]">
                        暫無紀錄
                      </span>
                    </div>
                  ) : (
                    logs.map((l, index) => (
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

                          {/* 顯示這筆紀錄對每個人餘額的變動 */}
                          {l.balanceChanges && (
                            <div className="flex gap-1.5 mt-2">
                              {Object.entries(l.balanceChanges).map(
                                ([bro, amt]) => {
                                  if (amt === 0) return null;
                                  const isPos = amt > 0;
                                  return (
                                    <span
                                      key={bro}
                                      className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                                        isPos
                                          ? "bg-indigo-50 text-indigo-600"
                                          : "bg-rose-50 text-rose-600"
                                      }`}
                                    >
                                      {BROTHERS[bro].name.split(" ")[1]}{" "}
                                      {isPos ? "+" : ""}
                                      {amt}
                                    </span>
                                  );
                                }
                              )}
                            </div>
                          )}
                        </div>

                        <div className="text-right ml-4 flex flex-col items-end gap-2 shrink-0">
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
                            onClick={() =>
                              setDeleteDialog({ isOpen: true, log: l })
                            }
                            className="text-[9px] text-rose-400 hover:text-rose-600 font-black px-2 py-1 rounded-md hover:bg-rose-50 transition-all opacity-0 group-hover:opacity-100 border border-transparent hover:border-rose-200 flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" /> 刪除
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        <p className="text-center text-[10px] text-slate-300 font-black uppercase tracking-[0.35em] py-16">
          Ma Brothers System • V13 Zero-Sum
        </p>
      </main>

      {/* 刪除確認 Modal */}
      {deleteDialog.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <h3 className="text-lg font-black text-slate-900">
                刪除歷史紀錄
              </h3>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6">
              <p className="font-bold text-slate-800 text-sm">
                {deleteDialog.log.desc} (${deleteDialog.log.amount})
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                請選擇您希望如何處理這筆紀錄：
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => handleConfirmDelete(true)}
                disabled={!deleteDialog.log.balanceChanges}
                className="w-full bg-rose-600 hover:bg-rose-700 text-white font-black py-4 rounded-xl transition-all shadow-md disabled:opacity-50 text-sm flex flex-col items-center leading-tight"
              >
                <span>連同金額一起回溯刪除</span>
                <span className="text-[9px] font-medium opacity-80 mt-1">
                  推薦：會把當時加減的金額反向退還
                </span>
              </button>

              <button
                onClick={() => handleConfirmDelete(false)}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-black py-4 rounded-xl transition-all text-sm flex flex-col items-center leading-tight border border-slate-200"
              >
                <span>僅刪除文字紀錄</span>
                <span className="text-[9px] font-medium opacity-80 mt-1">
                  目前面板上的餘額不會改變
                </span>
              </button>

              <button
                onClick={() => setDeleteDialog({ isOpen: false, log: null })}
                className="w-full py-3 text-xs font-black text-slate-400 hover:text-slate-600"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 結算還款計畫 Modal */}
      {showSettleModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                <Handshake className="w-6 h-6 text-indigo-600" />
              </div>
              <h3 className="text-xl font-black text-slate-900">
                結清款項明細
              </h3>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 mb-6 space-y-3 shadow-inner">
              {Object.values(balances).every((b) => b === 0) ? (
                <div className="text-center py-6">
                  <PartyPopper className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                  <p className="font-black text-slate-600">
                    目前沒有任何欠款
                    <br />
                    不需結算！
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest border-b border-slate-200 pb-2 mb-3">
                    請依下方指示進行轉帳或給現金：
                  </p>
                  {calculateSettlement().map((tx, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200 shadow-sm"
                    >
                      <span className="font-black text-rose-600 text-sm">
                        {BROTHERS[tx.from].name.split(" ")[1]}
                      </span>
                      <div className="flex flex-col items-center px-2">
                        <span className="text-[9px] text-slate-400 font-black mb-0.5">
                          應支付給
                        </span>
                        <ArrowRightLeft className="w-4 h-4 text-slate-300" />
                      </div>
                      <span className="font-black text-indigo-600 text-sm">
                        {BROTHERS[tx.to].name.split(" ")[1]}
                      </span>
                      <span className="font-black text-slate-800 text-lg ml-3">
                        ${tx.amount.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>

            <div className="space-y-3">
              <button
                onClick={handleSettleAll}
                disabled={Object.values(balances).every((b) => b === 0)}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 text-white font-black py-4 rounded-xl transition-all shadow-md text-sm flex items-center justify-center gap-2 active:scale-95"
              >
                <CheckCircle2 className="w-5 h-5" />
                確認大家已付清，全數歸零！
              </button>

              <button
                onClick={() => setShowSettleModal(false)}
                className="w-full py-3 text-xs font-black text-slate-400 hover:text-slate-600"
              >
                稍後再說
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        .animate-in { animation: fade-in 0.2s ease-out forwards; }
      `}</style>
    </div>
  );
};

export default App;
