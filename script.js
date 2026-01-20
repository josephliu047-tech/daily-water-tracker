// ⚠️ 請務必替換為你的網址

const API_URL = "https://script.google.com/macros/s/AKfycbzvVIscVr5OZCbTFK3htKZnqhw4Qxyj4U2W6XPltmD-aCXNVksCQ0j7H4hk1Yfs8fHl/exec"; 
// 您的GAS部署網址 請在此貼上網址

// === 1. 基礎設定與變數 ===
let records = JSON.parse(localStorage.getItem('waterRecords')) || [];
let weight = localStorage.getItem('userWeight') || 80;
let goal = weight * 30;
let waterChartInstance;   // 週統計圖表實例
let monthlyChartInstance; // 月統計圖表實例

// === 2. 系統啟動與初始化 ===
window.onload = () => {
    document.getElementById('weightInput').value = weight;
    logDebug("🚀 系統啟動，載入本地數據...");
    updateUI();
    renderChart();
};

// 儲存體重並計算目標
function saveProfile() {
    weight = document.getElementById('weightInput').value || 80;
    goal = weight * 30;
    localStorage.setItem('userWeight', weight);
    updateUI();
    renderChart();
    logDebug(`⚖️ 體重已更新：${weight}kg，目標：${goal}cc`);
}

// === 3. 飲水紀錄核心功能 (新增/刪除/清空) ===

// 加入飲水 (同步雲端)
async function addCustomWater() {
    const amountInput = document.getElementById('customAmount');
    const amount = parseInt(amountInput.value);
    if (!amount) return;

    const newRecord = {
        id: Date.now(), // 唯一 ID 用於刪除/修改
        date: new Date().toLocaleDateString('zh-TW'),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
        amount: amount
    };

    // 更新本地
    records.push(newRecord);
    localStorage.setItem('waterRecords', JSON.stringify(records));
    updateUI();
    renderChart();

    logDebug(`💧 正在同步 ${amount}ml 到雲端...`);
    try {
        await fetch(API_URL, {
            method: "POST",
            mode: "no-cors",
            body: JSON.stringify(newRecord)
        });
        document.getElementById('syncStatus').innerText = "狀態：已同步 ✅";
    } catch (e) {
        logDebug("❌ 同步失敗", "error");
    }
}

// 刪除單筆紀錄 (連動雲端)
async function deleteRecord(id) {
    if (!confirm("確定要刪除此筆紀錄並同步雲端嗎？")) return;

    records = records.filter(r => r.id !== id);
    localStorage.setItem('waterRecords', JSON.stringify(records));
    updateUI();
    renderChart();

    try {
        await fetch(API_URL, {
            method: "POST",
            mode: "no-cors",
            body: JSON.stringify({ action: "delete", id: id })
        });
        logDebug("🗑️ 雲端已同步刪除");
    } catch (e) {
        logDebug("❌ 雲端刪除失敗", "error");
    }
}

async function editRecord(id, oldAmount) {
    const newAmount = prompt("請輸入修改後的飲水量 (ml):", oldAmount);
    
    // 如果使用者取消或輸入無效，則不動作
    if (newAmount === null || newAmount === "" || isNaN(newAmount)) return;

    const parsedAmount = parseInt(newAmount);

    // 1. 【核心修正】同步更新本地資料陣列
    records = records.map(r => r.id === id ? { ...r, amount: parsedAmount } : r);
    localStorage.setItem('waterRecords', JSON.stringify(records));

    // 2. 【核心修正】立即重新渲染所有介面組件 (水球、文字、週圖表)
    updateUI();
    renderChart();

    logDebug(`✏️ 正在同步修改到雲端...`);
    
    try {
        // 發送異動請求給 GAS
        await fetch(API_URL, {
            method: "POST",
            mode: "no-cors",
            body: JSON.stringify({ 
                action: "edit", 
                id: id, 
                newAmount: parsedAmount 
            })
        });
        document.getElementById('syncStatus').innerText = "狀態：雲端已同步 ✅";
    } catch (e) {
        logDebug("❌ 雲端同步失敗，請檢查連線", "error");
    }
}

// 清空今日紀錄 (連動雲端)
async function clearToday() {
    if(!confirm("確定清空今日所有紀錄？(雲端將同步刪除)")) return;
    
    const now = new Date();
    // 傳送 YYYY-MM-DD 這種標準格式最保險
    const dateToSync = now.getFullYear() + "-" + (now.getMonth()+1) + "-" + now.getDate();
    const todayLocale = now.toLocaleDateString('zh-TW');

    // 1. 本地立即反應
    records = records.filter(r => r.date !== todayLocale);
    localStorage.setItem('waterRecords', JSON.stringify(records));
    updateUI();
    renderChart();

    // 2. 同步雲端
    try {
        await fetch(API_URL, { 
            method: "POST", 
            mode: "no-cors", 
            body: JSON.stringify({ 
                action: "clearToday", 
                date: dateToSync  // 傳送標準格式
            }) 
        });
        console.log("☁️ 雲端清空指令已送出");
    } catch (e) { 
        console.error("雲端同步失敗", e); 
    }
}

// === 4. UI 渲染與視覺效果 ===

function updateUI() {
    const today = new Date().toLocaleDateString('zh-TW');
    const todayRecords = records.filter(r => r.date === today);
    const total = todayRecords.reduce((s, r) => s + (parseInt(r.amount) || 0), 0);
    
    // 計算百分比
    const percent = Math.round((total / goal) * 100);
    
    // 1. 更新水球高度與文字
    document.getElementById('waterLevel').style.height = Math.min(percent, 100) + "%";
    document.getElementById('percentageText').innerText = percent + "%";
    
    // 2. 更新下方狀態文字 (關鍵修正)
    document.getElementById('status').innerText = `目前：${total} / ${goal} cc`;
    document.getElementById('dailyGoalText').innerText = `每日目標：${goal} cc`;

    // 3. 更新今日紀錄列表 (附帶刪除按鈕)
    const list = document.getElementById('historyList');
    list.innerHTML = todayRecords.slice().reverse().map(r => `
        <li>
            <span>${r.time} - <strong>${r.amount}ml</strong></span>
            <div style="display: flex; gap: 10px;">
                <button onclick="editRecord(${r.id}, ${r.amount})" style="background:none; border:none; color:#4285f4; cursor:pointer;
                padding:0;">✎</button>
                <button onclick="deleteRecord(${r.id})" style="background:none; border:none; color:#e74c3c; cursor:pointer; padding:0;">✕</button>
            </div>
        </li>
    `).join('');
}

// === 5. 圖表製作 (週統計與月統計) ===

// 渲染週統計 (藍色)
function renderChart() {
    const ctx = document.getElementById('waterChart').getContext('2d');
    const labels = [];
    const data = [];
    
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toLocaleDateString('zh-TW');
        labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
        const dayTotal = records.filter(r => r.date === dateStr).reduce((s, r) => s + (parseInt(r.amount) || 0), 0);
        data.push(dayTotal);
    }

    if (waterChartInstance) waterChartInstance.destroy();
    waterChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: '飲水量', data: data, backgroundColor: '#4285f4', barThickness: 15 },
                { label: '目標', data: Array(7).fill(goal), type: 'line', borderColor: 'red', borderDash: [5, 5], pointRadius: 0, fill: false }
            ]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, max: Math.max(goal + 500, 3000) } }
        }
    });
}

// 獲取月報表並繪製長條圖 (綠色)
async function fetchMonthlyReport() {
    const statsDiv = document.getElementById('monthlyStats');
    const chartContainer = document.getElementById('monthlyChartContainer');
    statsDiv.innerHTML = "正在讀取雲端歷史資料...";

    try {
        const res = await fetch(API_URL);
        const json = await res.json();
        const cloudData = json.cloudData || [];

        if (cloudData.length === 0) {
            statsDiv.innerHTML = "雲端尚無紀錄";
            return;
        }

        // 1. 按月份加總
        const monthlyMap = {};
        cloudData.forEach(r => {
            const dateObj = new Date(r.date);
            if (!isNaN(dateObj)) {
                const year = dateObj.getFullYear();
                const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                const monthKey = `${year}/${month}`;
                monthlyMap[monthKey] = (monthlyMap[monthKey] || 0) + (parseInt(r.amount) || 0);
            }
        });

        // 2. 排序：由遠到近
        let sortedMonthKeys = Object.keys(monthlyMap).sort((a, b) => {
            return new Date(a) - new Date(b); 
        });

        // 3. 【關鍵修正】：僅保留最後 12 個月 (由遠到近)
        if (sortedMonthKeys.length > 12) {
            sortedMonthKeys = sortedMonthKeys.slice(-12);
        }

        const chartValues = sortedMonthKeys.map(m => monthlyMap[m]);

        // 4. 顯示圖表
        chartContainer.style.display = "block";
        renderMonthlyChart(sortedMonthKeys, chartValues);

        // 5. 更新文字顯示 (顯示當月進度)
        const today = new Date();
        const currentMonthKey = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}`;
        const currentMonthTotal = monthlyMap[currentMonthKey] || 0;
        
        statsDiv.innerHTML = `本月 (${currentMonthKey}) 累計：<strong>${currentMonthTotal} cc</strong><br><small>(顯示最近 12 個月紀錄)</small>`;
        
    } catch (e) {
        console.error(e);
        statsDiv.innerHTML = "讀取失敗，請確認網路連線";
    }
}


function renderMonthlyChart(labels, data) {
    const ctx = document.getElementById('monthlyWaterChart').getContext('2d');
    if (monthlyChartInstance) monthlyChartInstance.destroy();

    monthlyChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '每月飲水量 (ml)',
                data: data,
                backgroundColor: 'rgba(40, 167, 69, 0.7)',
                borderColor: '#28a745',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });
}

// 輔助函式：日誌顯示
function logDebug(msg, type = 'info') {
    const consoleDiv = document.getElementById('monthlyStats');
    console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}