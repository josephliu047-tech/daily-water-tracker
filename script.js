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
window.onload = async () => {
    // 1. 讀取本地體重設定
    document.getElementById('weightInput').value = weight;
    
    // 2. 顯示同步狀態
    document.getElementById('syncStatus').innerText = "狀態：正在同步雲端資料... 🔄";
    
    // 3. 從雲端抓取最新資料並更新帳號資訊
    await syncWithCloud();
    
    // 4. 更新 UI 與圖表
    updateUI();
    renderChart();
};

// 核心功能：從雲端同步資料與帳號
async function syncWithCloud() {
    try {
        const response = await fetch(API_URL);
        const data = await response.json();
        
        // 處理帳號顯示 (去掉 @gmail.com)
        if (data.userEmail) {
            const accountName = data.userEmail.split('@')[0];
            document.getElementById('userAccount').innerText = accountName;
        }

        if (data.cloudData && data.cloudData.length > 0) {
            records = data.cloudData.map(r => {
                let dateStr;
                const d = new Date(r.date);
                // 修正時區偏移與 1899 年問題
                if (isNaN(d.getTime()) || d.getFullYear() <= 1900) {
                    dateStr = new Date().toLocaleDateString('zh-TW');
                } else {
                    dateStr = d.toLocaleDateString('zh-TW');
                }
                return {
                    id: r.id,
                    date: dateStr,
                    time: r.time,
                    amount: parseInt(r.amount)
                };
            });
            
            localStorage.setItem('waterRecords', JSON.stringify(records));
            document.getElementById('syncStatus').innerText = "狀態：雲端同步完成 ✅";
        } else {
            document.getElementById('syncStatus').innerText = "狀態：雲端目前無紀錄";
        }
    } catch (e) {
        console.error("同步失敗:", e);
        document.getElementById('userAccount').innerText = "訪客";
        document.getElementById('syncStatus').innerText = "狀態：僅使用本地模式";
    }
}

// === 3. 飲水操作功能 ===

// 儲存設定
function saveProfile() {
    weight = document.getElementById('weightInput').value || 80;
    goal = weight * 30;
    localStorage.setItem('userWeight', weight);
    updateUI();
    renderChart();
    alert("設定已儲存！");
}

// 加入飲水 (自定義)
async function addCustomWater() {
    const amountInput = document.getElementById('customAmount');
    const amount = parseInt(amountInput.value);
    if (!amount) return;
    await processAddWater(amount);
}

// 快速加入飲水 (300, 500, 700)
async function quickAddWater(amount) {
    await processAddWater(amount);
}

// 處理新增邏輯
async function processAddWater(amount) {
    const newRecord = { 
        id: Date.now(), 
        date: new Date().toLocaleDateString('zh-TW'), 
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false}), 
        amount: amount 
    };

    records.push(newRecord);
    localStorage.setItem('waterRecords', JSON.stringify(records));
    updateUI();
    renderChart();

    try {
        await fetch(API_URL, { 
            method: "POST", 
            mode: "no-cors", 
            body: JSON.stringify(newRecord) 
        });
    } catch (e) { console.error(e); }
}

// 刪除單筆
async function deleteRecord(id) {
    if (!confirm("確定要刪除此筆紀錄嗎？")) return;
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
    } catch (e) { console.error(e); }
}

// 清空今日
async function clearToday() {
    if (!confirm("確定要清空今日所有紀錄？(雲端將同步刪除)")) return;
    
    const now = new Date();
    const todayStr = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`;
    const todayLocale = now.toLocaleDateString('zh-TW');

    records = records.filter(r => r.date !== todayLocale);
    localStorage.setItem('waterRecords', JSON.stringify(records));
    updateUI();
    renderChart();

    try {
        await fetch(API_URL, { 
            method: "POST", 
            mode: "no-cors", 
            body: JSON.stringify({ action: "clearToday", date: todayStr }) 
        });
    } catch (e) { console.error(e); }
}

// === 4. UI 渲染功能 ===

function updateUI() {
    const today = new Date().toLocaleDateString('zh-TW');
    const todayRecords = records.filter(r => r.date === today);
    const total = todayRecords.reduce((sum, r) => sum + (parseInt(r.amount) || 0), 0);
    const percent = Math.min(Math.round((total / goal) * 100), 100);

    // 更新水球
    document.getElementById('waterLevel').style.height = percent + "%";
    document.getElementById('percentageText').innerText = percent + "%";
    
    // 更新文字
    document.getElementById('status').innerText = `目前：${total} / ${goal} cc`;
    document.getElementById('dailyGoalText').innerText = `每日目標：${goal} cc`;

    // 更新列表
    const listElement = document.getElementById('historyList');
    listElement.innerHTML = todayRecords.slice().reverse().map(r => `
        <li>
            <span>${r.time} - <strong>${r.amount}ml</strong></span>
            <button onclick="deleteRecord(${r.id})" class="btn-action btn-delete">✕</button>
        </li>
    `).join('');
}

// === 5. 圖表功能 (週/月) ===

function renderChart() {
    const ctx = document.getElementById('waterChart').getContext('2d');
    const labels = [];
    const data = [];

    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toLocaleDateString('zh-TW');
        labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
        
        const dayTotal = records
            .filter(r => r.date === dateStr)
            .reduce((sum, r) => sum + (parseInt(r.amount) || 0), 0);
        data.push(dayTotal);
    }

    if (waterChartInstance) waterChartInstance.destroy();
    waterChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '飲水量 (ml)',
                data: data,
                backgroundColor: '#4285f4',
                borderRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true } }
        }
    });
}

// 獲取月報表
async function fetchMonthlyReport() {
    const statsDiv = document.getElementById('monthlyStats');
    statsDiv.innerHTML = "正在計算月統計資料... ⏳";
    
    try {
        const response = await fetch(API_URL);
        const json = await response.json();
        const cloudData = json.cloudData;

        const monthlyMap = {};
        cloudData.forEach(r => {
            const d = new Date(r.date);
            if (isNaN(d.getTime()) || d.getFullYear() <= 1900) return;
            const monthKey = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
            monthlyMap[monthKey] = (monthlyMap[monthKey] || 0) + parseInt(r.amount);
        });

        const sortedMonthKeys = Object.keys(monthlyMap).sort().slice(-12);
        const chartValues = sortedMonthKeys.map(k => monthlyMap[k]);

        document.getElementById('monthlyChartContainer').style.display = "block";
        renderMonthlyChart(sortedMonthKeys, chartValues);

        const thisMonth = sortedMonthKeys[sortedMonthKeys.length - 1];
        statsDiv.innerHTML = `本月 (${thisMonth}) 累計：<strong>${monthlyMap[thisMonth] || 0} cc</strong>`;
        
    } catch (e) {
        statsDiv.innerHTML = "讀取失敗";
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
                label: '每月飲水',
                data: data,
                backgroundColor: '#34a853'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}