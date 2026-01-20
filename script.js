// ⚠️ 請務必替換為你的網址

const API_URL = "https://script.google.com/macros/s/AKfycbzvVIscVr5OZCbTFK3htKZnqhw4Qxyj4U2W6XPltmD-aCXNVksCQ0j7H4hk1Yfs8fHl/exec"; 
// 您的GAS部署網址 請在此貼上網址


let records = JSON.parse(localStorage.getItem('waterRecords')) || [];
let weight = localStorage.getItem('userWeight') || 80;
let goal = weight * 30;
let waterChartInstance;

// Debug 日誌函式
function logDebug(msg, type = 'info') {
    const logs = document.getElementById('debugLogs');
    const now = new Date().toLocaleTimeString();
    let color = "#00ff00"; // 預設綠色
    if (type === 'error') color = "#ff4757"; // 錯誤紅色
    if (type === 'warn') color = "#ffa502";  // 警告橘色
    
    logs.innerHTML += `<div style="color:${color}">[${now}] ${msg}</div>`;
    logs.parentElement.scrollTop = logs.parentElement.scrollHeight; // 自動捲動
}


window.onload = async () => {
    document.getElementById('weightInput').value = weight;
    updateUI();
    renderChart();
    
    logDebug("🚀 系統啟動，嘗試建立與雲端的安全連線...");
    
    try {
        // 使用 no-cors 雖然拿不到內容，但可以確認網址是否通暢
        await fetch(API_URL, { mode: 'no-cors' });
        logDebug("📡 連線測試：GAS 伺服器已回應。");
        
        // 嘗試正式讀取身份（若失敗則顯示手動授權提醒）
        const res = await fetch(API_URL);
        const json = await res.json();
        
        if (json.detected_email) {
            logDebug(`✅ 識別身份: ${json.detected_email}`, 'success');
            logDebug(`📁 雲端檔案: ${json.fileName}`, 'success');
        }
    } catch (e) {
        logDebug("⚠️ 診斷提示：瀏覽器阻擋了身分讀取 (CORS)。", 'warn');
        logDebug("💡 只要您手動開啟過 API 網址並看到 JSON，寫入功能即不受影響。", 'info');
    }
};

function saveProfile() {
    const w = document.getElementById('weightInput').value;
    if (w > 0) {
        weight = w;
        goal = weight * 30;
        localStorage.setItem('userWeight', weight);
        updateUI();
        renderChart();
        logDebug(`體重更新: ${weight}kg, 目標: ${goal}cc`);
    }
}


async function addCustomWater() {
    const amount = document.getElementById('customAmount').value;
    
    // 診斷點 1：確認函式有被觸發
    console.log("按鈕已按下，準備傳送量：", amount);
    logDebug("📡 準備呼叫 API...");

    if (!API_URL || API_URL.includes("您的GAS部署網址")) {
        alert("錯誤：API_URL 尚未設定正確！");
        return;
    }

    try {
        // 診斷點 2：嘗試發送
        const response = await fetch(API_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({
                date: new Date().toLocaleDateString(),
                time: new Date().toLocaleTimeString(),
                amount: amount
            })
        });

        logDebug("🚀 請求已送出，請檢查 GAS 執行項目");
        
        // 更新 UI
        records.push({ date: new Date().toLocaleDateString(), amount: parseInt(amount), time: new Date().toLocaleTimeString() });
        localStorage.setItem('waterRecords', JSON.stringify(records));
        updateUI();
        if (window.renderChart) renderChart();

    } catch (e) {
        logDebug("❌ 發送失敗：" + e.message, "error");
        console.error("Fetch Error:", e);
    }
}

async function fetchMonthlyReport() {
    const statsDiv = document.getElementById('monthlyStats');
    statsDiv.innerHTML = "正在連線雲端...";
    logDebug("正在讀取雲端報表...");
    
    try {
        const res = await fetch(API_URL);
        const json = await res.json(); // 現在回傳的是一個物件 { cloudData: [...] }
        
        const data = json.cloudData || [];
        const total = data.reduce((s, r) => s + (parseInt(r.amount) || 0), 0);
        
        statsDiv.innerHTML = `雲端總累計飲水量：<strong>${total} cc</strong>`;
        logDebug(`✅ 讀取成功！雲端共有 ${data.length} 筆紀錄`);
    } catch (e) {
        statsDiv.innerHTML = "讀取失敗";
        logDebug(`❌ 讀取失敗: ${e.message}`, 'error');
    }
}

// updateUI, renderChart, resetToday 等函式內容與 v2 相同，保持不變...
function updateUI() {
    const today = new Date().toLocaleDateString();
    const todayRecords = records.filter(r => r.date === today);
    const total = todayRecords.reduce((s, r) => s + r.amount, 0);
    document.getElementById('dailyGoalText').innerText = `每日目標：${goal} cc`;
    document.getElementById('status').innerText = `目前：${total} / ${goal} cc`;
    document.getElementById('historyList').innerHTML = todayRecords.reverse().slice(0, 5).map(r => `<li>${r.time} - ${r.amount}ml</li>`).join('');
}

function renderChart() {
    const ctx = document.getElementById('waterChart').getContext('2d');
    const labels = []; const data = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
        const dateStr = d.toLocaleDateString();
        data.push(records.filter(r => r.date === dateStr).reduce((s, r) => s + r.amount, 0));
    }
    if (waterChartInstance) waterChartInstance.destroy();
    waterChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'ml', data: data, backgroundColor: '#4285f4', barThickness: 15 },
                { label: '目標', data: Array(7).fill(goal), type: 'line', borderColor: '#ea4335', borderDash: [5, 5], pointRadius: 0, fill: false }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, max: Math.max(goal + 500, 3000) } },
            plugins: { legend: { display: false } }
        }
    });
}

function resetToday() {
    if (confirm("確定清空本地紀錄？")) {
        const today = new Date().toLocaleDateString();
        records = records.filter(r => r.date !== today);
        localStorage.setItem('waterRecords', JSON.stringify(records));
        updateUI(); renderChart();
        logDebug("🗑️ 本地紀錄已重設");
    }
}