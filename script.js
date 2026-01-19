let currentWater = 0;
const goal = 2000; // 你可以自己修改目標值

function addWater(amount) {
    currentWater += amount;
    updateUI();
}

function reset() {
    currentWater = 0;
    updateUI();
}

function updateUI() {
    // 計算百分比
    let percentage = Math.min((currentWater / goal) * 100, 100);
    
    // 更新畫面文字與進度條
    document.getElementById('status').innerText = `目前飲水量：${currentWater} / ${goal} cc`;
    document.getElementById('progress-bar').style.width = percentage + '%';
    document.getElementById('progress-bar').innerText = Math.floor(percentage) + '%';

    // 達成目標的小彩蛋
    if (currentWater >= goal) {
        alert("太棒了！你已達成今日飲水目標！");
    }
}