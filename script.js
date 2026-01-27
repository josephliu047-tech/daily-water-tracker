// ⚠️ 請確保 API_URL 網址正確
const API_URL = "https://script.google.com/macros/s/AKfycbzvVIscVr5OZCbTFK3htKZnqhw4Qxyj4U2W6XPltmD-aCXNVksCQ0j7H4hk1Yfs8fHl/exec"; 

let records = JSON.parse(localStorage.getItem('waterRecords')) || [];
let weight = localStorage.getItem('userWeight') || 80;
let goal = weight * 30;
let waterChartInstance;   
let monthlyChartInstance; 

// === 系統啟動 ===
window.onload = async () => {
    document.getElementById('weightInput').value = weight;
    document.getElementById('syncStatus').innerText = "狀態：正在同步雲端資料... 🔄";
    await syncWithCloud();
    updateUI();
    renderChart();
};

// 雲端同步
async function syncWithCloud() {
    try {
        const response = await fetch(API_URL);
        const data = await response.json();
        
        // 處理帳號名稱
        if (data.userEmail) {
            const nameOnly = data.userEmail.split('@')[0];
            document.getElementById('userAccount').innerText = nameOnly;
        }

        if (data.cloudData && data.cloudData.length > 0) {
            records = data.cloudData.map(r => {
                let dateStr;
                const d = new Date(r.date);
                dateStr = (isNaN(d.getTime()) || d.getFullYear() <= 1900) ? 
                    new Date().toLocaleDateString('zh-TW') : d.toLocaleDateString('zh-TW');
                return { id: r.id, date: dateStr, time: r.time, amount: parseInt(r.amount) };
            });
            localStorage.setItem('waterRecords', JSON.stringify(records));
            document.getElementById('syncStatus').innerText = "狀態：已同步 ✅";
        }
    } catch (e) {
        console.error("同步失敗:", e);
        document.getElementById('userAccount').innerText = "訪客";
    }
}

// 基礎功能
function saveProfile() {
    weight = document.getElementById('weightInput').value || 80;
    goal = weight * 30;
    localStorage.setItem('userWeight', weight);
    updateUI();
    renderChart();
    alert("設定已儲存！");
}

async function addCustomWater() {
    const amount = parseInt(document.getElementById('customAmount').value);
    if (!amount) return;
    await processAddWater(amount);
}

async function quickAddWater(amount) {
    await processAddWater(amount);
}

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
        await fetch(API_URL, { method: "POST", mode: "no-cors", body: JSON.stringify(newRecord) });
    } catch (e) { console.error(e); }
}

async function deleteRecord(id) {
    if (!confirm("確定要刪除？")) return;
    records = records.filter(r => r.id !== id);
    localStorage.setItem('waterRecords', JSON.stringify(records));
    updateUI();
    renderChart();
    try {
        await fetch(API_URL, { method: "POST", mode: "no-cors", body: JSON.stringify({ action: "delete", id: id }) });
    } catch (e) { console.error(e); }
}

async function clearToday() {
    if (!confirm("確定清空今日雲端紀錄？")) return;
    const now = new Date();
    const todayStr = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`;
    const todayLocale = now.toLocaleDateString('zh-TW');
    records = records.filter(r => r.date !== todayLocale);
    localStorage.setItem('waterRecords', JSON.stringify(records));
    updateUI();
    renderChart();
    try {
        await fetch(API_URL, { method: "POST", mode: "no-cors", body: JSON.stringify({ action: "clearToday", date: todayStr }) });
    } catch (e) { console.error(e); }
}

function updateUI() {
    const today = new Date().toLocaleDateString('zh-TW');
    const todayRecords = records.filter(r => r.date === today);
    const total = todayRecords.reduce((s, r) => s + (parseInt(r.amount) || 0), 0);
    const percent = Math.min(Math.round((total / goal) * 100), 100);

    document.getElementById('waterLevel').style.height = percent + "%";
    document.getElementById('percentageText').innerText = percent + "%";
    document.getElementById('status').innerText = `目前：${total} / ${goal} cc`;
    document.getElementById('dailyGoalText').innerText = `每日目標：${goal} cc`;

    const list = document.getElementById('historyList');
    list.innerHTML = todayRecords.slice().reverse().map(r => `
        <li>
            <span>${r.time} - <strong>${r.amount}ml</strong></span>
            <button onclick="deleteRecord(${r.id})" style="background:none; border:none; color:#e74c3c; cursor:pointer; font-size:20px;">✕</button>
        </li>
    `).join('');
}

// === 週統計圖表 (長條圖) ===
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
            datasets: [{ label: '飲水量 (ml)', data: data, backgroundColor: '#4285f4', borderRadius: 5 }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// === 三個月趨勢報表 (折線圖) ===
// 修正：邏輯改為 curr < today，即不包含今天
async function fetchTrendReport() {
    const statsDiv = document.getElementById('monthlyStats');
    statsDiv.innerHTML = "正在計算三個月趨勢 (不含今日)... ⏳";
    
    try {
        const response = await fetch(API_URL);
        const json = await response.json();
        const cloudData = json.cloudData;

        const now = new Date();
        const today = new Date();
        today.setHours(0, 0, 0, 0); // 今日凌晨零點

        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(now.getMonth() - 3);
        threeMonthsAgo.setHours(0, 0, 0, 0);

        // 整理資料
        const dailyMap = {};
        cloudData.forEach(r => {
            const d = new Date(r.date);
            if (d >= threeMonthsAgo) {
                const dateKey = d.toLocaleDateString('zh-TW');
                dailyMap[dateKey] = (dailyMap[dateKey] || 0) + parseInt(r.amount);
            }
        });

        // 建立連續的標籤 (從 90 天前到 昨天)
        const labels = [];
        const data = [];
        let curr = new Date(threeMonthsAgo);
        
        // 修正處：curr < today (排除當天)
        while (curr < today) {
            const dateStr = curr.toLocaleDateString('zh-TW');
            labels.push(`${curr.getMonth() + 1}/${curr.getDate()}`);
            data.push(dailyMap[dateStr] || 0);
            curr.setDate(curr.getDate() + 1);
        }

        document.getElementById('monthlyChartContainer').style.display = "block";
        renderTrendLineChart(labels, data);

        const avgIntake = data.length > 0 ? Math.round(data.reduce((a, b) => a + b) / data.length) : 0;
        statsDiv.innerHTML = `過去 90 天 (不含今日) 平均：<strong>${avgIntake} cc</strong>`;
    } catch (e) {
        console.error(e);
        statsDiv.innerHTML = "讀取失敗";
    }
}

function renderTrendLineChart(labels, data) {
    const ctx = document.getElementById('monthlyWaterChart').getContext('2d');
    if (monthlyChartInstance) monthlyChartInstance.destroy();

    monthlyChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '每日飲水量趨勢',
                data: data,
                borderColor: '#34a853',
                backgroundColor: 'rgba(52, 168, 83, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 1 
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            scales: {
                x: {
                    ticks: {
                        autoSkip: true,
                        maxTicksLimit: 10 
                    }
                }
            }
        }
    });
}