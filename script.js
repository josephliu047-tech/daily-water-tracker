let records = JSON.parse(localStorage.getItem('waterRecords')) || [];
let goal = parseInt(localStorage.getItem('dailyGoal')) || 2000;
let googleScriptUrl = localStorage.getItem('googleScriptUrl') || "";
let waterChartInstance;

// 初始化頁面
window.onload = () => {
    document.getElementById('weightInput').value = localStorage.getItem('userWeight') || "";
    document.getElementById('scriptUrlInput').value = googleScriptUrl;
    updateUI();
    renderChart();
};

function saveProfile() {
    const weight = document.getElementById('weightInput').value;
    const url = document.getElementById('scriptUrlInput').value.trim();
    if (weight > 0) {
        goal = weight * 30;
        localStorage.setItem('dailyGoal', goal);
        localStorage.setItem('userWeight', weight);
    }
    googleScriptUrl = url;
    localStorage.setItem('googleScriptUrl', url);
    updateUI();
    renderChart();
    alert("設定已儲存！");
}

function addCustomWater() {
    const amount = parseInt(document.getElementById('customAmount').value);
    if (!amount || amount <= 0) return alert("請輸入正確的水量");
    
    const now = new Date();
    const newRecord = {
        id: Date.now(),
        time: now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false}),
        date: now.toLocaleDateString(),
        amount: amount
    };
    records.push(newRecord);
    saveAndRefresh(newRecord);
}

function deleteRecord(id) {
    if (confirm("確定刪除此筆紀錄？")) {
        records = records.filter(r => r.id !== id);
        saveAndRefresh();
    }
}

function editRecord(id) {
    const record = records.find(r => r.id === id);
    const newAmount = prompt("修改水量 (ml):", record.amount);
    if (newAmount && !isNaN(newAmount) && newAmount > 0) {
        record.amount = parseInt(newAmount);
        saveAndRefresh();
    }
}

function saveAndRefresh(syncData = null) {
    localStorage.setItem('waterRecords', JSON.stringify(records));
    updateUI();
    renderChart();
    if (syncData && googleScriptUrl) syncToGoogleSheets(syncData);
}

function syncToGoogleSheets(data) {
    const statusTag = document.getElementById('syncStatus');
    statusTag.innerText = "狀態：同步中...";
    fetch(googleScriptUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    })
    .then(() => {
        statusTag.innerText = "狀態：已同步 ✅";
        statusTag.style.color = "#2ecc71";
    })
    .catch(() => {
        statusTag.innerText = "狀態：同步失敗 ❌";
        statusTag.style.color = "#e74c3c";
    });
}

function updateUI() {
    const today = new Date().toLocaleDateString();
    const todayRecords = records.filter(r => r.date === today);
    const totalToday = todayRecords.reduce((sum, r) => sum + r.amount, 0);
    
    const percentage = Math.min((totalToday / goal) * 100, 100);
    const bar = document.getElementById('progress-bar');
    bar.style.width = percentage + '%';
    bar.innerText = Math.floor(percentage) + '%';
    
    document.getElementById('status').innerText = `目前：${totalToday} / ${goal} cc`;
    document.getElementById('dailyGoalText').innerText = `每日目標：${goal} cc`;

    const list = document.getElementById('historyList');
    list.innerHTML = '';
    [...todayRecords].reverse().forEach(r => {
        const li = document.createElement('li');
        li.className = 'history-item';
        li.innerHTML = `
            <span>${r.time} - <strong>${r.amount}ml</strong></span>
            <div class="history-actions">
                <button onclick="editRecord(${r.id})">改</button>
                <button onclick="deleteRecord(${r.id})">刪</button>
            </div>
        `;
        list.appendChild(li);
    });
}

function renderChart() {
    const ctx = document.getElementById('waterChart').getContext('2d');
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        last7Days.push(d.toLocaleDateString());
    }

    const dailyData = last7Days.map(date => 
        records.filter(r => r.date === date).reduce((sum, r) => sum + r.amount, 0)
    );

    if (waterChartInstance) waterChartInstance.destroy();
    waterChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: last7Days.map(d => d.split('/').slice(1,3).join('/')),
            datasets: [{
                label: '飲水量',
                data: dailyData,
                backgroundColor: 'rgba(52, 152, 219, 0.6)',
                borderRadius: 5
            }, {
                label: '目標',
                data: Array(7).fill(goal),
                type: 'line',
                borderColor: '#e74c3c',
                pointRadius: 0,
                borderDash: [5, 5]
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });
}

function resetToday() {
    if(confirm("確定清空今日紀錄？")) {
        const today = new Date().toLocaleDateString();
        records = records.filter(r => r.date !== today);
        saveAndRefresh();
    }
}

async function fetchMonthlyReport() {
    if (!googleScriptUrl) return alert("請先設定 Google 網址！");
    
    const statsDiv = document.getElementById('monthlyStats');
    statsDiv.innerHTML = "正在從雲端抓取資料...";

    try {
        // 發送 GET 請求讀取資料
        const response = await fetch(googleScriptUrl);
        const cloudData = await response.json();
        
        const now = new Date();
        const thisMonth = now.getMonth() + 1;
        const thisYear = now.getFullYear();

        let monthlyTotal = 0;
        let daysDrank = new Set(); // 用來計算這個月有幾天有喝水

        cloudData.forEach(item => {
            const d = new Date(item.date);
            if (d.getFullYear() === thisYear && (d.getMonth() + 1) === thisMonth) {
                monthlyTotal += parseInt(item.amount);
                daysDrank.add(item.date);
            }
        });

        const avg = daysDrank.size > 0 ? Math.round(monthlyTotal / daysDrank.size) : 0;

        statsDiv.innerHTML = `
            <strong>📅 ${thisYear}年 ${thisMonth}月 統計</strong><br>
            累積總飲水量：${monthlyTotal} cc<br>
            本月記錄天數：${daysDrank.size} 天<br>
            日平均飲水量：${avg} cc / 天<br>
            <small style="color: #888;">* 數據來自您的 Google Sheets</small>
        `;

    } catch (err) {
        console.error(err);
        statsDiv.innerHTML = "讀取失敗，請確認 Google Script 部署權限是否設為「所有人」。";
    }
}