// ===== CONFIG API =====
const API_URL = "https://script.google.com/macros/s/AKfycbwACemSWP_b5OsUMd4rWaGRvhJDqBPeMJ9eKPHOzguv90B5J22m6e3KsM3FgZQ4fBQb/exec";

// ===== LOAD DATA TỪ API =====
async function fetchScheduleData({ san, brand, date }) {
  showLoading();

  try {
    const res = await fetch(`${API_URL}?action=processForm`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ san, brand, date })
      }
    );

    const text = await res.text();
    const json = JSON.parse(text);

    if (!json.ok) {
      throw new Error(json.error || "API error");
    }

    currentData = json.data;

    console.log("✅ DATA LOADED:", currentData);

    applyDataToUI();

  } catch (err) {
    console.error(err);
    showAlert("Không tải được dữ liệu", "error");
  } finally {
    hideLoading();
  }
}

// ===== GẮN DATA VÀO UI =====
function applyDataToUI() {
  if (!currentData) return;

  // ===== HEADER =====
  document.getElementById("brandName").innerText =
    currentData.brandInfo?.brandName || "";

  document.getElementById("brandLogo").innerHTML =
    `<img src="${currentData.brandInfo?.img || ""}" style="height:60px">`;

  document.getElementById("currentDate").innerText =
    currentData.date || "--/--";

  // ===== BACKGROUND =====
  if (currentData.generalBackgrounds?.length) {
    const bg = currentData.generalBackgrounds[0];
    document.getElementById("backgroundSection").style.display = "block";
    document.getElementById("backgroundDisplay").src = bg.link;
  }

  // ===== INFO CHUNG =====
  document.getElementById("infoContent").innerHTML =
    `<pre style="white-space:pre-wrap">${currentData.noteData || ""}</pre>`;

  // ===== LỊCH =====
  renderSchedules(currentData.backgroundData.finalResults || []);
}

// ===== BIẾN VÀ HÀM TOÀN CỤC =====
let currentUser = null;
let currentData = {};
let countdownTimers = [];
let allUsers = [];
let autoRefreshInterval = null;
let autoRefreshScheduleTimer = null;

// ===== HÀM TIỆN ÍCH =====
function showLoading() {
  const loadingEl = document.getElementById('loading');
  if (loadingEl) loadingEl.style.display = 'flex';
}

function hideLoading() {
  const loadingEl = document.getElementById('loading');
  if (loadingEl) loadingEl.style.display = 'none';
}

function showAlert(message, type) {
  const alert = document.createElement('div');
  alert.className = `fixed top-5 right-5 px-4 py-3 rounded-lg shadow-lg z-50 animate-slide-in-right ${type === 'success' ? 'bg-green-500' : 'bg-red-500'} text-white`;
  alert.innerHTML = `<i class="fas fa-${type === 'success' ? 'check' : 'exclamation'}-circle mr-2"></i>${message}`;
  document.body.appendChild(alert);
  
  setTimeout(() => {
    alert.style.animation = 'slide-out-right 0.3s ease';
    setTimeout(() => alert.remove(), 300);
  }, 3000);
  
  if (!document.getElementById('alert-animations')) {
    const style = document.createElement('style');
    style.id = 'alert-animations';
    style.textContent = `
      @keyframes slide-in-right {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes slide-out-right {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
      }
      .animate-slide-in-right {
        animation: slide-in-right 0.3s ease;
      }
    `;
    document.head.appendChild(style);
  }
}

function copyToClipboard(text) {
  if (!text || text.trim() === '') {
    showAlert('Không có nội dung để copy!', 'error');
    return;
  }
  
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  
  textarea.select();
  textarea.setSelectionRange(0, 99999);
  
  try {
    const successful = document.execCommand('copy');
    if (successful) {
      showAlert('Đã copy tiêu đề!', 'success');
    } else {
      showAlert('Không thể copy, vui lòng thử lại!', 'error');
    }
  } catch (err) {
    console.error('Copy failed:', err);
    showAlert('Lỗi khi copy: ' + err, 'error');
  }
  
  document.body.removeChild(textarea);
}

function getLiveStatus(startTime, endTime) {
  if (!startTime || !endTime) return { 
    status: 'not_live', 
    class: 'status-ended', 
    text: 'CHƯA LIVE',
    minutesLive: 0,
    timeUntilStart: Infinity // THÊM DÒNG NÀY
  };
  
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  
  const startDate = new Date(today);
  startDate.setHours(startHour, startMinute, 0, 0);
  const endDate = new Date(today);
  endDate.setHours(endHour, endMinute, 0, 0);
  if (endDate < startDate) endDate.setDate(endDate.getDate() + 1);
  
  const timeDiffStart = startDate - now;
  const timeDiffEnd = endDate - now;
  
  // Tính số phút đã LIVE
  let minutesLive = 0;
  if (timeDiffStart <= 0 && timeDiffEnd > 0) {
    minutesLive = Math.floor((now - startDate) / (60 * 1000));
  }
  
  if (timeDiffStart <= 0 && timeDiffEnd > 0) {
    return { 
      status: 'live', 
      class: 'status-live', 
      text: 'ĐANG LIVE',
      minutesLive: minutesLive,
      timeUntilStart: 0 // THÊM DÒNG NÀY
    };
  } else if (timeDiffStart > 0 && timeDiffStart <= 30 * 60 * 1000) {
    // "SẮP DIỄN RA": Còn 30 phút trở xuống
    return { 
      status: 'soon', 
      class: 'status-soon', 
      text: 'SẮP DIỄN RA',
      minutesLive: 0,
      timeUntilStart: timeDiffStart // GIỮ LẠI DÒNG NÀY
    };
  } else if (timeDiffStart > 30 * 60 * 1000) {
    // "SẮP TỚI": Còn trên 30 phút
    return { 
      status: 'upcoming', 
      class: 'status-upcoming', 
      text: 'SẮP TỚI',
      minutesLive: 0,
      timeUntilStart: timeDiffStart  // GIỮ LẠI DÒNG NÀY
    };
  } else {
    return { 
      status: 'ended', 
      class: 'status-ended', 
      text: 'ĐÃ KẾT THÚC',
      minutesLive: 0,
      timeUntilStart: 0 // THÊM DÒNG NÀY
    };
  }
}
function getTimestampFromTime(timeString) {
  if (!timeString || !timeString.includes(':')) return 0;
  
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
}

// ===== HÀM TẢI DỮ LIỆU CHÍNH =====
async function loadScheduleForToday() {
  if (!currentUser) return;

  showLoading();

  const now = new Date();
  const date = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}`;

  console.log("📅 Đang tải dữ liệu cho ngày:", date);

  try {
    const res = await fetch(`${API_URL}?action=processForm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        san: currentUser.platform,
        brand: currentUser.brand,
        date: date
      })
    });

    const text = await res.text();
    let response;

    try {
      response = JSON.parse(text);
    } catch {
      throw new Error("API không trả về JSON");
    }

    console.log("📦 Nhận được response:", response);

    if (!response.success) {
      throw new Error(response.message || "Không thể tải dữ liệu");
    }

    const formattedData = {};
    const key = `${currentUser.brand}_${currentUser.platform}`;
    formattedData[key] = response.data;

    currentData = formattedData;

    displayScheduleData(currentData, date);
    updateInfoPanels();
    updateRoomInfo();
    startAllCountdowns();

    console.log("✅ Đã tải dữ liệu. Sẽ auto refresh...");
    scheduleAutoRefresh();

  } catch (err) {
    console.error("❌ Lỗi tải dữ liệu:", err);
    showAlert(err.message || "Lỗi kết nối!", "error");
    scheduleAutoRefresh();

  } finally {
    hideLoading();
  }
}

function displayScheduleData(data, date) {
  console.log("Data nhận được:", data);
  let scheduleRows = [];
  let total = 0, live = 0, upcoming = 0, ended = 0, notLiveYet = 0;
  
  // Biến để kiểm tra có phiên nào đã LIVE 45 phút chưa
  let has45MinLive = false;
  
  Object.keys(data).forEach(brandKey => {
    const brandData = data[brandKey];
    
    // CHỈ SỬ DỤNG finalResults (đã xử lý ISKEEP)
    const finalResults = brandData.backgroundData?.finalResults || [];
    
    if (finalResults.length === 0) {
      console.log(`Không có finalResults cho ${brandKey}`);
      return;
    }
    
    console.log(`=== DEBUG ISKEEP PROCESSING ===`);
    console.log(`Brand: ${brandKey}`);
    console.log(`Results (before ISKEEP): ${brandData.results?.length || 0}`);
    console.log(`ResultsWithHostCode (before ISKEEP): ${brandData.resultsWithHostCode?.length || 0}`);
    console.log(`FinalResults (after ISKEEP): ${finalResults.length}`);
    
    finalResults.forEach((result, index) => {
      console.log(`Phiên ${index + 1}: ${result.startTime}-${result.endTime}, isMerged: ${result.isMerged}, mergedCount: ${result.mergedCount}`);
    });
    console.log(`=== END DEBUG ===`);
    
    finalResults.forEach((result, index) => {
      total++;
      
      const title = result.finalOutput || result.title || '';
      const startTime = result.startTime || '';
      const endTime = result.endTime || '';
      const liveStatus = getLiveStatus(startTime, endTime);
      
      switch(liveStatus.status) {
        case 'live': live++; break;
        case 'soon': upcoming++; break;
        case 'upcoming': upcoming++; break;
        case 'not_live': notLiveYet++; break;
        case 'ended': ended++; break;
      }
      
      // Nếu là phiên đang LIVE, kiểm tra xem đã 45 phút chưa
      if (liveStatus.status === 'live') {
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const [hours, minutes] = startTime.split(':').map(Number);
        
        const startDate = new Date(today);
        startDate.setHours(hours, minutes, 0, 0);
        const minutesLive = Math.floor((now - startDate) / (60 * 1000));
        
        if (minutesLive >= 45) {
          has45MinLive = true;
        }
      }
      
      // Tính thời gian còn lại đến khi bắt đầu (cho countdown)
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const [startHours, startMinutes] = startTime.split(':').map(Number);
      const startDate = new Date(today);
      startDate.setHours(startHours, startMinutes, 0, 0);
      const timeUntilStart = startDate - now;
      
      // Tìm thông tin host từ resultsWithHostCode (nếu có)
      let hostInfo = '';
      let hostCodeInfo = '';
      
      // Nếu là phiên đã nối, lấy thông tin host từ phiên đầu tiên
      if (result.isMerged && result.mergedSessions && result.mergedSessions.length > 0) {
        // Lấy thông tin từ phiên đầu tiên trong danh sách merged
        const firstMergedIndex = result.mergedSessions[0].rowNumber - 2; // Trừ 2 vì có header và index bắt đầu từ 0
        if (brandData.resultsWithHostCode && brandData.resultsWithHostCode[firstMergedIndex]) {
          const firstSession = brandData.resultsWithHostCode[firstMergedIndex];
          hostInfo = firstSession.host || '';
          hostCodeInfo = firstSession.hostCode || '';
        }
      } else {
        // Phiên không nối, lấy thông tin bình thường
        if (brandData.resultsWithHostCode && brandData.resultsWithHostCode[index]) {
          const hostData = brandData.resultsWithHostCode[index];
          hostInfo = hostData.host || '';
          hostCodeInfo = hostData.hostCode || '';
        }
      }
      
      scheduleRows.push({
        brand: result.brand || '',
        san: result.san || '',
        date: result.date || '',
        startTime, 
        endTime,
        title,
        host: hostInfo,
        pic: result.pic || '',
        liveStatus: liveStatus.status,
        liveClass: liveStatus.class,
        liveText: liveStatus.text,
        countdownId: `countdown-${brandKey}-${index}`,
        startTimestamp: getTimestampFromTime(startTime),
        minutesLive: liveStatus.minutesLive || 0,
        timeUntilStart: timeUntilStart > 0 ? timeUntilStart : 0,
        isMerged: result.isMerged || false,
        mergedCount: result.mergedCount || 1,
        mergedSessions: result.mergedSessions || [],
        hostCode: result.hostCode || hostCodeInfo,
        // LOGIC MỚI: Hiển thị nút copy khi còn 1 tiếng trước khi bắt đầu
        shouldShowCopyForSoon: (function() {
          if (liveStatus.status === 'live') return true;
          if (liveStatus.status === 'soon' || liveStatus.status === 'upcoming') {
            const oneHourMs = 60 * 60 * 1000;
            return timeUntilStart > 0 && timeUntilStart <= oneHourMs;
          }
          return false;
        })()
      });
    });
  });
  
  // Sắp xếp theo giờ bắt đầu
  scheduleRows.sort((a, b) => a.startTimestamp - b.startTimestamp);
  
  // Xác định chỉ 1 phiên "Sắp tới"
  const upcomingRows = scheduleRows.filter(row => 
    ['soon', 'upcoming', 'not_live'].includes(row.liveStatus));
  
  if (upcomingRows.length > 0) {
    scheduleRows.forEach(row => {
      if (['soon', 'upcoming'].includes(row.liveStatus)) {
        row.liveStatus = 'not_live';
        row.liveClass = 'status-ended';
        row.liveText = 'CHƯA LIVE';
      }
    });
    
    const nextUpcoming = upcomingRows[0];
    const rowIndex = scheduleRows.findIndex(r => 
      r.startTime === nextUpcoming.startTime && 
      r.endTime === nextUpcoming.endTime);
    
    if (rowIndex !== -1) {
      if (nextUpcoming.liveStatus === 'soon') {
        scheduleRows[rowIndex].liveStatus = 'soon';
        scheduleRows[rowIndex].liveClass = 'status-soon';
        scheduleRows[rowIndex].liveText = 'SẮP DIỄN RA';
      } else {
        scheduleRows[rowIndex].liveStatus = 'upcoming';
        scheduleRows[rowIndex].liveClass = 'status-upcoming';
        scheduleRows[rowIndex].liveText = 'SẮP TỚI';
      }
    }
  }

  // LOGIC MỚI: Hiển thị nút copy khi còn 1 tiếng trước khi bắt đầu
  scheduleRows.forEach((row, index) => {
    const oneHourBefore = 60 * 60 * 1000; // 1 giờ = 60 phút = 3600 giây = 3,600,000 ms
    
    if (row.liveStatus === 'live') {
      // CA LIVE: luôn có nút copy
      row.shouldShowCopyForSoon = true;
    } else if (row.liveStatus === 'soon' || row.liveStatus === 'upcoming') {
      // CA SẮP TỚI: chỉ có nút copy nếu còn 1 tiếng trở xuống
      row.shouldShowCopyForSoon = row.timeUntilStart <= oneHourBefore;
    } else {
      row.shouldShowCopyForSoon = false;
    }
  });
  
  // Update summary
  if (document.getElementById('totalSchedules')) {
    document.getElementById('totalSchedules').textContent = total;
  }
  if (document.getElementById('liveSchedules')) {
    document.getElementById('liveSchedules').textContent = live;
  }
  if (document.getElementById('upcomingSchedules')) {
    document.getElementById('upcomingSchedules').textContent = upcoming;
  }
  if (document.getElementById('endedSchedules')) {
    document.getElementById('endedSchedules').textContent = ended + notLiveYet;
  }
  
  // Tạo views
  const upcomingForTab = scheduleRows.filter(row => 
    row.liveStatus === 'upcoming' || row.liveStatus === 'soon');
  createUpcomingCards(upcomingForTab);
  
  createAllCards(scheduleRows);
  createTable(scheduleRows);
  
  // Khởi động tất cả countdowns
  startAllCountdowns();
  
  // Nếu có phiên đã LIVE 45 phút, kích hoạt nút copy cho phiên sắp tới
  if (has45MinLive) {
    console.log('✅ Có phiên đã LIVE 45 phút, kích hoạt nút copy cho phiên sắp tới');
    enableCopyForUpcomingSessions();
  }
}

function updateInfoPanels() {
  let noteContent = '';
  let bgImage = '';
  let bgNote = '';
  
  if (currentData && Object.keys(currentData).length > 0) {
    const firstKey = Object.keys(currentData)[0];
    const brandData = currentData[firstKey];
    
    if (brandData && brandData.noteData) {
      noteContent = brandData.noteData;
    }
    
    if (brandData && brandData.generalBackgrounds && brandData.generalBackgrounds.length > 0) {
      const bg = brandData.generalBackgrounds[0];
      bgImage = bg.link;
      bgNote = bg.noteBg || bg.note || '';
      
      const section = document.getElementById('backgroundSection');
      const img = document.getElementById('backgroundDisplay');
      const info = document.getElementById('backgroundInfo');
      
      if (section && img) {
        section.style.display = 'block';
        img.src = bgImage;
        img.onerror = function() {
          this.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgdmlld0BveD0iMCAwIDQwMCAzMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjQwMCIgaGVpZ2h0PSIzMDAiIGZpbGw9IiNlZGVkZWQiIHJ4PSIxMCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOTk5IiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTYiPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==';
        };
        if (info) {
          info.innerHTML = bgNote ? `<div class="mt-2"><i class="fas fa-sticky-note mr-2 text-blue-900"></i><strong>Ghi chú:</strong> ${bgNote}</div>` : '';
        }
      }
    } else {
      const section = document.getElementById('backgroundSection');
      if (section) section.style.display = 'none';
    }
  } else {
    const section = document.getElementById('backgroundSection');
    if (section) section.style.display = 'none';
  }
  
  const infoContent = document.getElementById('infoContent');
  if (infoContent) {
    if (typeof noteContent === 'string' && noteContent.trim() !== '') {
      infoContent.innerHTML = `<span class="note-blink">${noteContent}</span>`;
    } else {
      infoContent.innerHTML = '<em>Không có thông tin ghi chú</em>';
    }
  }
}

// ===== HÀM TẠO CARD VÀ TABLE =====
function createUpcomingCards(rows) {
  const container = document.getElementById('upcomingCards');
  if (!container) return;
  
  container.innerHTML = rows.length ? '' : '<div class="col-span-full text-center py-10 text-gray-500"><i class="fas fa-calendar-times fa-3x mb-4"></i><p>Không có lịch sắp tới</p></div>';
  rows.forEach((row, i) => container.appendChild(createCardElement(row, i)));
}

function createAllCards(rows) {
  const container = document.getElementById('cardsGrid');
  if (!container) return;
  
  container.innerHTML = rows.length ? '' : '<div class="col-span-full text-center py-10 text-gray-500"><i class="fas fa-calendar-times fa-3x mb-4"></i><p>Không có lịch trình</p></div>';
  rows.forEach((row, i) => container.appendChild(createCardElement(row, i)));
}
function createCardElement(row, index) {
  const card = document.createElement('div');
  card.className = 'live-card';
  
  const shopCart = currentData && Object.keys(currentData).length > 0 ? 
    currentData[Object.keys(currentData)[0]].shopCartInfo : '';
  
  const showCopyButton = row.shouldShowCopyForSoon;
  
  // Tạo countdown cho "SẮP DIỄN RA" và "SẮP TỚI"
  let countdownHTML = '';
  if (row.liveStatus === 'soon' || row.liveStatus === 'upcoming') {
    countdownHTML = `<div class="countdown" id="${row.countdownId}"></div>`;
  }
  
  // THÊM INDICATOR ĐƠN GIẢN CHO PHIÊN ĐÃ NỐI
  const mergedIndicator = row.isMerged ? 
    `<div style="display: inline-block; background: #f3e8ff; color: #7c3aed; font-size: 10px; padding: 2px 8px; border-radius: 10px; margin-left: 8px; border: 1px solid #ddd6fe;">
      <i class="fas fa-link" style="margin-right: 3px;"></i>${row.mergedCount} phiên
    </div>` : '';
  
  card.innerHTML = `
    <div class="card-header">
      <div style="display: flex; align-items: center;">
        <div class="card-time">${row.startTime} - ${row.endTime}</div>
        ${mergedIndicator}
      </div>
      <div class="card-status ${row.liveClass}">
        ${row.liveStatus === 'live' ? '<i class="fas fa-circle fa-pulse"></i>' : 
          row.liveStatus === 'soon' ? '<i class="fas fa-clock"></i>' :
          row.liveStatus === 'upcoming' ? '<i class="far fa-clock"></i>' :
          row.liveStatus === 'not_live' ? '<i class="far fa-clock"></i>' :
          '<i class="far fa-check-circle"></i>'} ${row.liveText}
        ${row.liveStatus === 'live' ? `<span style="font-size: 10px; margin-left: 5px;">(${row.minutesLive} phút)</span>` : ''}
      </div>
    </div>
    <div class="card-body">
      <div class="card-title">${row.title || 'Không có tiêu đề'}</div>
      ${shopCart ? `
        <div class="shop-cart mt-4 p-3 bg-gradient-to-r from-blue-50 to-teal-50 border-l-4 border-blue-900 rounded-lg shadow-sm">
          <div class="flex items-center gap-2 text-blue-900 mb-2">
            <i class="fas fa-shopping-cart text-blue-700"></i>
            <span class="font-bold text-blue-900">SHOP CART:</span>
          </div>
          <div class="shop-cart-value">${shopCart}</div>
        </div>
      ` : ''}
    </div>
    <div class="card-footer">
      ${countdownHTML}
      <div class="card-actions">
        ${showCopyButton ? 
          `<button class="action-btn copy-btn" data-title="${row.title}">
            <i class="fas fa-copy"></i> Copy
          </button>` : 
          ''
        }
      </div>
    </div>
  `;
  
  if (showCopyButton) {
    const copyBtn = card.querySelector('.copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', function() {
        copyToClipboard(this.dataset.title);
        const btn = this;
        btn.innerHTML = '<i class="fas fa-check"></i> Đã Copy';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.innerHTML = '<i class="fas fa-copy"></i> Copy';
          btn.classList.remove('copied');
        }, 1500);
      });
    }
  }
  
  return card;
}

// Hàm tính thời lượng giữa 2 mốc thời gian
function calculateDuration(startTime, endTime) {
  if (!startTime || !endTime || !startTime.includes(':') || !endTime.includes(':')) {
    return 0;
  }
  
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  
  let totalMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
  
  // Xử lý trường hợp qua ngày
  if (totalMinutes < 0) {
    totalMinutes += 24 * 60;
  }
  
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  return minutes > 0 ? `${hours}.${Math.round(minutes/60*10)}` : `${hours}`;
}

// Hàm hiển thị modal chi tiết phiên đã nối
function showMergedDetails(index) {
  if (!currentData || Object.keys(currentData).length === 0) return;
  
  const firstKey = Object.keys(currentData)[0];
  const brandData = currentData[firstKey];
  
  if (!brandData || !brandData.backgroundData || !brandData.backgroundData.finalResults) {
    return;
  }
  
  const result = brandData.backgroundData.finalResults[index];
  if (!result || !result.isMerged || !result.mergedSessions) {
    return;
  }
  
  // Tạo modal hiển thị chi tiết
  const modalHTML = `
    <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <div class="sticky top-0 bg-gradient-to-r from-purple-900 to-purple-700 text-white p-6">
          <div class="flex justify-between items-center">
            <div>
              <h2 class="text-2xl font-bold flex items-center gap-3">
                <i class="fas fa-layer-group"></i>
                CHI TIẾT PHIÊN NỐI
              </h2>
              <div class="mt-2 text-purple-200">
                ${result.startTime} - ${result.endTime} • ${result.mergedCount} phiên
              </div>
            </div>
            <button onclick="closeMergedModal()" class="text-white hover:text-purple-200 text-2xl">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>
        
        <div class="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          <!-- Thông tin tổng quan -->
          <div class="mb-6 p-4 bg-purple-50 rounded-lg border border-purple-200">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <div class="text-sm text-purple-600 font-medium">Tổng thời lượng</div>
                <div class="text-2xl font-bold text-purple-900">
                  ${calculateDuration(result.startTime, result.endTime)} giờ
                </div>
              </div>
              <div>
                <div class="text-sm text-purple-600 font-medium">Số phiên gộp</div>
                <div class="text-2xl font-bold text-purple-900">
                  ${result.mergedCount} phiên
                </div>
              </div>
            </div>
          </div>
          
          <!-- Danh sách các phiên gốc -->
          <div class="mb-6">
            <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <i class="fas fa-list-ol text-purple-600"></i>
              DANH SÁCH PHIÊN GỐC
            </h3>
            <div class="space-y-3">
              ${result.mergedSessions.map((session, idx) => `
                <div class="flex items-center p-4 bg-white border border-gray-200 rounded-lg hover:bg-purple-50 transition ${session.isKeep === '1' ? 'border-l-4 border-l-green-500' : ''}">
                  <div class="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-purple-100 to-pink-100 rounded-lg flex items-center justify-center mr-4">
                    <span class="font-bold text-purple-800">${idx + 1}</span>
                  </div>
                  <div class="flex-grow">
                    <div class="flex justify-between items-center">
                      <div>
                        <div class="font-bold text-gray-800 text-lg">
                          ${session.startTime} - ${session.endTime}
                        </div>
                        <div class="text-sm text-gray-500 mt-1">
                          Dòng ${session.rowNumber} • Brand: ${result.brand}
                        </div>
                      </div>
                      <div class="flex items-center gap-2">
                        ${session.isKeep === '1' ? 
                          `<span class="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium flex items-center gap-1">
                            <i class="fas fa-check-circle"></i> ISKEEP=1
                          </span>` : 
                          `<span class="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm">
                            ISKEEP=${session.isKeep || '0'}
                          </span>`
                        }
                        <span class="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                          ${calculateDuration(session.startTime, session.endTime)}h
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
          
          <!-- Thông tin title -->
          <div class="p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div class="text-sm text-gray-500 font-medium mb-2">TIÊU ĐỀ ĐÃ NỐI</div>
            <div class="font-medium text-gray-800 text-lg p-3 bg-white rounded border border-gray-300">
              ${result.finalOutput || result.title || 'Không có tiêu đề'}
            </div>
          </div>
        </div>
        
        <div class="sticky bottom-0 bg-gray-50 p-4 border-t border-gray-200 flex justify-end gap-3">
          <button onclick="closeMergedModal()" class="px-5 py-2 bg-gray-200 text-gray-800 rounded-lg font-medium hover:bg-gray-300 transition">
            Đóng
          </button>
          <button onclick="copyMergedTitle(${index})" class="px-5 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition flex items-center gap-2">
            <i class="fas fa-copy"></i>
            Copy tiêu đề
          </button>
        </div>
      </div>
    </div>
  `;
  
  // Tạo và thêm modal vào DOM
  const modalContainer = document.createElement('div');
  modalContainer.id = 'mergedDetailsModal';
  modalContainer.innerHTML = modalHTML;
  document.body.appendChild(modalContainer);
  
  // Ngăn scroll body khi modal mở
  document.body.style.overflow = 'hidden';
}

// Hàm đóng modal
function closeMergedModal() {
  const modal = document.getElementById('mergedDetailsModal');
  if (modal) {
    modal.remove();
    document.body.style.overflow = 'auto';
  }
}

// Hàm copy tiêu đề phiên đã nối
function copyMergedTitle(index) {
  if (!currentData || Object.keys(currentData).length === 0) return;
  
  const firstKey = Object.keys(currentData)[0];
  const brandData = currentData[firstKey];
  
  if (!brandData || !brandData.backgroundData || !brandData.backgroundData.finalResults) {
    return;
  }
  
  const result = brandData.backgroundData.finalResults[index];
  if (!result) return;
  
  copyToClipboard(result.finalOutput || result.title || '');
  
  // Hiển thị thông báo
  const button = document.querySelector('#mergedDetailsModal button:last-child');
  if (button) {
    const originalHTML = button.innerHTML;
    button.innerHTML = '<i class="fas fa-check"></i> Đã copy!';
    button.classList.add('bg-green-600', 'hover:bg-green-700');
    setTimeout(() => {
      button.innerHTML = originalHTML;
      button.classList.remove('bg-green-600', 'hover:bg-green-700');
    }, 2000);
  }
}


function createTable(rows) {
  const tbody = document.getElementById('tableBody');
  if (!tbody) return;
  
  tbody.innerHTML = rows.length ? '' : '<tr><td colspan="6" class="text-center py-10 text-gray-500"><i class="fas fa-calendar-times fa-2x mb-2"></i><p>Không có lịch trình</p></td></tr>';
  
  const shopCart = currentData && Object.keys(currentData).length > 0 ? 
    currentData[Object.keys(currentData)[0]].shopCartInfo : '';
  
  rows.forEach((row, i) => {
    // LOGIC MỚI: Hiển thị nút copy dựa trên điều kiện
let showCopyButton = row.shouldShowCopyForSoon;
    
    // SỬA: LUÔN HIỂN THỊ COUNTDOWN (không phụ thuộc vào điều kiện nào khác)
    let countdownHTML = '';
    if (row.liveStatus === 'soon' || row.liveStatus === 'upcoming') {
      countdownHTML = `<div class="countdown" id="table-${row.countdownId}"></div>`;
    }
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td class="time-cell">${row.startTime} - ${row.endTime}</td>
      <td class="title-cell">
        <div class="title-text">${row.title || 'Không có tiêu đề'}</div>
${shopCart ? `
  <div class="shop-cart mt-3 p-3 bg-gradient-to-r from-blue-50 to-teal-50 border-l-4 border-blue-900 rounded">
    <div class="flex items-center gap-2 text-blue-900 mb-1">
      <i class="fas fa-shopping-cart text-sm"></i>
      <span class="font-bold text-sm">SHOP CART:</span>
    </div>
    <div class="shop-cart-value text-sm">${shopCart}</div>
  </div>
` : ''}
      </td>
      <td class="host-cell">${row.host || 'Chưa có'}</td>
      <td class="status-cell">
        <div class="status-badge ${row.liveClass}">
          ${row.liveStatus === 'live' ? '<i class="fas fa-circle fa-pulse"></i>' : 
            row.liveStatus === 'soon' ? '<i class="fas fa-clock"></i>' :
            row.liveStatus === 'upcoming' ? '<i class="far fa-clock"></i>' :
            row.liveStatus === 'not_live' ? '<i class="far fa-clock"></i>' :
            '<i class="far fa-check-circle"></i>'} ${row.liveText}
          ${row.liveStatus === 'live' ? `<span style="font-size: 9px; margin-left: 3px;">(${row.minutesLive} phút)</span>` : ''}
        </div>
        ${countdownHTML}
      </td>
      <td>
        <div class="flex gap-2">
          ${showCopyButton ? 
            `<button class="action-btn copy-btn" data-title="${row.title}">
              <i class="fas fa-copy"></i>
            </button>` : 
            ''
          }
        </div>
      </td>
    `;
    
    if (showCopyButton) {
      const copyBtn = tr.querySelector('.copy-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', function() {
          copyToClipboard(this.dataset.title);
        });
      }
    }
    
    tbody.appendChild(tr);
  });
}
// ===== COUNTDOWN TIMERS =====
function startAllCountdowns() {
  clearAllCountdowns();
  
  // SỬA: Lấy tất cả phần tử có class .countdown (giống code cũ)
  document.querySelectorAll('.countdown').forEach(timer => {
    const card = timer.closest('.live-card, tr');
    if (card) {
      const timeCell = card.querySelector('.card-time, .time-cell');
      if (timeCell) {
        const startTime = timeCell.textContent.split(' - ')[0];
        if (startTime && startTime.includes(':')) {
          startCountdownTimer(timer.id, startTime);
        }
      }
    }
  });
}

function startCountdownTimer(id, startTime) {
  const timer = document.getElementById(id);
  if (!timer) return;
  
  const update = () => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const [hours, minutes] = startTime.split(':').map(Number);
    const startDate = new Date(today);
    startDate.setHours(hours, minutes, 0, 0);
    const timeDiff = startDate - now;
    
    if (timeDiff <= 0) {
      timer.textContent = '';
      return;
    }
    
    // HIỂN THỊ ĐẾM NGƯỢC KHI CÒN 30 PHÚT TRỞ XUỐNG (giống code cũ)
    if (timeDiff <= 30 * 60 * 1000) {
      const mins = Math.floor(timeDiff / (60 * 1000));
      const secs = Math.floor((timeDiff % (60 * 1000)) / 1000);
      // THAY ĐỔI: Giống code cũ - "Còn MM:SS" thay vì "Bắt đầu sau: MM:SS"
      timer.textContent = `Còn ${mins}:${secs.toString().padStart(2,'0')}`;
    } else {
      timer.textContent = '';
    }
  };
  
  update();
  const intervalId = setInterval(update, 1000);
  countdownTimers.push(intervalId);
}

function clearAllCountdowns() {
  countdownTimers.forEach(clearInterval);
  countdownTimers = [];
}

// ===== AUTO REFRESH =====
function scheduleAutoRefresh() {
  if (autoRefreshScheduleTimer) {
    clearTimeout(autoRefreshScheduleTimer);
  }
  
  showRefreshCountdown(300); // Đổi từ 30 thành 300 (5 phút)
  
  autoRefreshScheduleTimer = setTimeout(function() {
    console.log('🔄 Tự động tải lại dữ liệu... ' + new Date().toLocaleTimeString());
    hideRefreshCountdown();
    loadScheduleForToday();
  }, 300000); // Đổi từ 30000 (30s) thành 300000 (300s = 5 phút)
  
  console.log(`⏰ Đã lên lịch tải lại sau 5 phút (${new Date().toLocaleTimeString()})`);
}

function showRefreshCountdown(seconds) {
  const statusEl = document.getElementById('autoRefreshStatus');
  const countdownEl = document.getElementById('refreshCountdown');
  
  if (statusEl && countdownEl) {
    statusEl.classList.remove('hidden');
    countdownEl.textContent = seconds;
    
    let remaining = seconds;
    const countdownInterval = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(countdownInterval);
        countdownEl.textContent = '0';
      } else {
        countdownEl.textContent = remaining;
      }
    }, 1000);
    
    window.refreshCountdownInterval = countdownInterval;
  }
}

function hideRefreshCountdown() {
  const statusEl = document.getElementById('autoRefreshStatus');
  if (statusEl) {
    statusEl.classList.add('hidden');
  }
  
  if (window.refreshCountdownInterval) {
    clearInterval(window.refreshCountdownInterval);
  }
}

function stopAutoRefreshSchedule() {
  if (autoRefreshScheduleTimer) {
    clearTimeout(autoRefreshScheduleTimer);
    autoRefreshScheduleTimer = null;
  }
  hideRefreshCountdown();
  console.log('⏹️ Đã dừng lịch tải lại tự động');
}

// ===== LOGOUT =====
function logoutUser() {
  const loadingText = document.getElementById('loadingText');
  if (loadingText) {
    loadingText.innerHTML = '<i class="fas fa-sign-out-alt fa-spin mr-2"></i>Đang đăng xuất...';
  }
  
  const loading = document.getElementById('loading');
  if (loading) {
    loading.style.display = 'flex';
  }
  
  if (typeof showAlert === 'function') {
    showAlert(`Đã đăng xuất tài khoản ${currentUser?.username || ''}!`, 'success');
  }
  
  stopAutoRefreshSchedule();
  
  currentUser = null;
  localStorage.removeItem('liveschedule_user');
  
  clearAllCountdowns();
  
  document.getElementById('confirmLogoutModal').style.display = 'none';
  
  if (document.getElementById('username')) {
    document.getElementById('username').value = '';
  }
  if (document.getElementById('password')) {
    document.getElementById('password').value = '';
  }
  if (document.getElementById('userSelect')) {
    document.getElementById('userSelect').value = '';
  }
  
  setTimeout(() => {
    if (loadingText) {
      loadingText.innerHTML = '<i class="fas fa-sync-alt fa-spin mr-2"></i>Đang tải dữ liệu...';
    }
    
    if (loading) {
      loading.style.display = 'none';
    }
    
    document.getElementById('loginModal').style.display = 'flex';
    document.getElementById('mainContent').style.display = 'none';
  }, 1000);
}

function confirmLogoutWithPassword() {
  const inputPass = document.getElementById('logoutPassword').value;
  const errorBox = document.getElementById('logoutError');
  const realPass = currentUser?.password;

  if (!inputPass || inputPass !== realPass) {
    errorBox.classList.remove('hidden');
    return;
  }

  errorBox.classList.add('hidden');
  document.getElementById('logoutPassword').value = '';
  logoutUser();
}

// ===== ĐĂNG NHẬP =====
async function simpleLogin(username, password) {
  const loginLoading = document.getElementById('loginLoading');
  const loginButton = document.getElementById('loginButton');
  const loginError = document.getElementById('loginError');

  if (loginLoading) loginLoading.classList.remove('hidden');
  if (loginButton) loginButton.disabled = true;
  if (loginError) loginError.classList.add('hidden');

  try {
    const res = await fetch(`${API_URL}?action=simpleLogin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username,
        password
      })
    });

    const text = await res.text();
    let response;

    try {
      response = JSON.parse(text);
    } catch {
      throw new Error("API không trả về JSON");
    }

    if (!response.success) {
      throw new Error(response.message || "Đăng nhập thất bại");
    }

    // ✅ LOGIN OK
    currentUser = response.user;
    localStorage.setItem('liveschedule_user', JSON.stringify(currentUser));

    showMainContent();
    loadScheduleForToday();
    showAlert(`Chào mừng ${currentUser.username}!`, 'success');

  } catch (err) {
    console.error("❌ Login error:", err);
    showLoginError(err.message || 'Lỗi kết nối! Vui lòng thử lại.');

  } finally {
    if (loginLoading) loginLoading.classList.add('hidden');
    if (loginButton) loginButton.disabled = false;
  }
}

function showLoginError(message) {
  const errorMessage = document.getElementById('errorMessage');
  const loginError = document.getElementById('loginError');
  
  if (errorMessage && loginError) {
    errorMessage.textContent = message;
    loginError.classList.remove('hidden');
  }
}

function hideLoginError() {
  const loginError = document.getElementById('loginError');
  if (loginError) loginError.classList.add('hidden');
}

function showMainContent() {
  const loginModal = document.getElementById('loginModal');
  const mainContent = document.getElementById('mainContent');
  
  if (loginModal) loginModal.style.display = 'none';
  if (mainContent) mainContent.style.display = 'block';
  
  if (document.getElementById('userName')) {
    document.getElementById('userName').textContent = currentUser.username;
  }
  if (document.getElementById('brandName')) {
    document.getElementById('brandName').textContent = currentUser.brandName || currentUser.brand;
  }
  if (document.getElementById('platformInfo')) {
    document.getElementById('platformInfo').textContent = `${currentUser.brand.toUpperCase()} ${currentUser.platform.toUpperCase()}`;
  }
  
  const brandLogo = document.getElementById('brandLogo');
  if (brandLogo) {
    if (currentUser.img) {
      brandLogo.innerHTML = `<img src="${currentUser.img}" alt="Logo" class="w-full h-full object-contain p-1 rounded-lg" onerror="handleLogoError(this)">`;
    } else {
      brandLogo.innerHTML = '<div class="w-full h-full bg-gradient-to-br from-blue-900 to-teal-400 rounded-lg flex items-center justify-center text-white text-2xl"><i class="fas fa-tv"></i></div>';
    }
  }
  
  const now = new Date();
  if (document.getElementById('currentDate')) {
    document.getElementById('currentDate').textContent = 
      `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`;
  }
}

function handleLogoError(imgElement) {
  if (imgElement && imgElement.parentElement) {
    imgElement.parentElement.innerHTML = '<div class="w-full h-full bg-gradient-to-br from-blue-900 to-teal-400 rounded-lg flex items-center justify-center text-white text-2xl"><i class="fas fa-tv"></i></div>';
  }
}

// ===== DOM READY =====
document.addEventListener('DOMContentLoaded', () => {

  /* =======================
     LOAD USERS LIST (FETCH)
  ======================== */
  async function loadUsersList() {
    try {
      const res = await fetch(`${API_URL}?action=getUsersList`);
      const json = await res.json();

      if (!json.success) throw new Error(json.message);

      allUsers = json.users;
      populateUserSelect();

    } catch (err) {
      console.error('❌ Load users failed:', err);
      showAlert('Không tải được danh sách user', 'error');
    }
  }

  function populateUserSelect() {
    const userSelect = document.getElementById('userSelect');
    if (!userSelect) return;

    userSelect.innerHTML = '<option value="">-- Chọn user --</option>';

    allUsers.forEach(user => {
      const option = document.createElement('option');
      option.value = user.id;
      option.textContent = `${user.username} (${user.brand} ${user.platform})`;
      userSelect.appendChild(option);
    });
  }

  /* =======================
     LOGIN FORM
  ======================== */
  const userSelect = document.getElementById('userSelect');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const loginForm = document.getElementById('loginForm');

  if (userSelect) {
    userSelect.addEventListener('change', function () {
      const user = allUsers.find(u => u.id == this.value);
      if (user) {
        usernameInput.value = user.username;
        passwordInput.value = '';
        passwordInput.focus();
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const username = usernameInput.value.trim();
      const password = passwordInput.value.trim();

      if (!userSelect.value) {
        showLoginError('Vui lòng chọn user!');
        return;
      }

      if (!password) {
        showLoginError('Vui lòng nhập mật khẩu!');
        return;
      }

      hideLoginError();
      await simpleLogin(username, password);
    });
  }

  /* =======================
     LOGOUT
  ======================== */
  document.getElementById('logoutBtn')?.addEventListener('click', e => {
    e.preventDefault();
    document.getElementById('confirmLogoutModal').style.display = 'flex';
  });

  document.getElementById('cancelLogout')?.addEventListener('click', e => {
    e.preventDefault();
    document.getElementById('confirmLogoutModal').style.display = 'none';
  });

  document.getElementById('closeBackgroundModal')?.addEventListener('click', () => {
    document.getElementById('backgroundModal').style.display = 'none';
  });

  /* =======================
     AUTO LOGIN
  ======================== */
  const savedUser = localStorage.getItem('liveschedule_user');
  if (savedUser) {
    try {
      currentUser = JSON.parse(savedUser);
      showMainContent();
      loadScheduleForToday();
    } catch {
      localStorage.removeItem('liveschedule_user');
      document.getElementById('loginModal').style.display = 'flex';
    }
  } else {
    document.getElementById('loginModal').style.display = 'flex';
  }

  loadUsersList();
});

// Hàm phóng to background
function openBackgroundFullscreen(imageUrl) {
  const modal = document.getElementById('backgroundModal');
  const img = document.getElementById('backgroundImage');
  
  if (!img || !modal) return;
  
  img.src = imageUrl;
  
  modal.style.display = 'flex';
}

// Thêm vào cuối script trong Html.txt
function updateLiveMinutes() {
  const now = new Date();
  
  // Cập nhật thời gian cho các phiên đang LIVE
  document.querySelectorAll('.live-card, tr').forEach(element => {
    const statusBadge = element.querySelector('.card-status, .status-badge');
    if (statusBadge && statusBadge.textContent.includes('ĐANG LIVE')) {
      const timeCell = element.querySelector('.card-time, .time-cell');
      if (timeCell) {
        const startTime = timeCell.textContent.split(' - ')[0];
        if (startTime && startTime.includes(':')) {
          const [hours, minutes] = startTime.split(':').map(Number);
          const startDate = new Date();
          startDate.setHours(hours, minutes, 0, 0);
          const minutesLive = Math.floor((now - startDate) / (60 * 1000));
          
          // Cập nhật hiển thị thời gian
          const minutesSpan = statusBadge.querySelector('span');
          if (minutesSpan) {
            minutesSpan.textContent = `(${minutesLive} phút)`;
          }
          
          // Nếu đã LIVE 45 phút, hiển thị nút copy cho phiên "SẮP DIỄN RA"
          if (minutesLive >= 45) {
            const soonCards = document.querySelectorAll('.status-soon, .status-upcoming');
            soonCards.forEach(soonCard => {
              const copyBtn = soonCard.closest('.live-card, tr')?.querySelector('.copy-btn');
              if (copyBtn) {
                copyBtn.style.display = 'flex';
              }
            });
          }
        }
      }
    }
  });
}

// Chạy cập nhật mỗi phút
setInterval(updateLiveMinutes, 60000);

// Thêm hàm để lấy room từ dữ liệu
function getRoomFromData(data) {
  if (!data || Object.keys(data).length === 0) return '--';
  
  const firstKey = Object.keys(data)[0];
  const brandData = data[firstKey];
  
  if (brandData.resultsWithHostCode && brandData.resultsWithHostCode.length > 0) {
    // Lấy room từ phiên đầu tiên (hoặc có thể lấy từ phiên hiện tại)
    const firstSchedule = brandData.resultsWithHostCode[0];
    return firstSchedule.room || '--';
  }
  
  return '--';
}

// Hàm cập nhật thông tin Room theo phiên đang/sắp LIVE
function updateRoomInfo() {
  const roomInfo = document.getElementById('roomInfo');
  if (!roomInfo || !currentData || Object.keys(currentData).length === 0) return;
  
  const firstKey = Object.keys(currentData)[0];
  const brandData = currentData[firstKey];
  
  // Kiểm tra các phiên đang LIVE
  let currentRoom = '--';
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  
  // Tìm phiên đang LIVE đầu tiên
  if (brandData.resultsWithHostCode && brandData.resultsWithHostCode.length > 0) {
    for (const schedule of brandData.resultsWithHostCode) {
      const startTime = schedule.startTime || '';
      const endTime = schedule.endTime || '';
      
      if (startTime && endTime && startTime.includes(':') && endTime.includes(':')) {
        const [startHour, startMinute] = startTime.split(':').map(Number);
        const [endHour, endMinute] = endTime.split(':').map(Number);
        
        const startDate = new Date(today);
        startDate.setHours(startHour, startMinute, 0, 0);
        const endDate = new Date(today);
        endDate.setHours(endHour, endMinute, 0, 0);
        if (endDate < startDate) endDate.setDate(endDate.getDate() + 1);
        
        // Kiểm tra xem hiện tại có nằm trong khoảng thời gian không
        if (now >= startDate && now <= endDate) {
          currentRoom = schedule.room || '--';
          break; // Dừng ngay khi tìm thấy phiên đang LIVE
        }
      }
    }
  }
  
  // Nếu không có phiên đang LIVE, tìm phiên SẮP TỚI gần nhất
  if (currentRoom === '--' && brandData.resultsWithHostCode && brandData.resultsWithHostCode.length > 0) {
    let upcomingRoom = '--';
    let minTimeDiff = Infinity;
    
    for (const schedule of brandData.resultsWithHostCode) {
      const startTime = schedule.startTime || '';
      
      if (startTime && startTime.includes(':')) {
        const [startHour, startMinute] = startTime.split(':').map(Number);
        const startDate = new Date(today);
        startDate.setHours(startHour, startMinute, 0, 0);
        
        // Tính thời gian còn lại đến khi bắt đầu
        const timeDiff = startDate - now;
        
        // Chỉ lấy phiên chưa bắt đầu và gần nhất (trong vòng 4 tiếng)
        if (timeDiff > 0 && timeDiff <= 4 * 60 * 60 * 1000 && timeDiff < minTimeDiff) {
          minTimeDiff = timeDiff;
          upcomingRoom = schedule.room || '--';
        }
      }
    }
    
    if (upcomingRoom !== '--') {
      currentRoom = upcomingRoom;
    }
  }
  
  roomInfo.textContent = `Room: ${currentRoom}`;
}

// Tự động cập nhật Room mỗi phút
setInterval(updateRoomInfo, 60000);

// Cập nhật Room khi chuyển tab hoặc tải dữ liệu mới
document.addEventListener('visibilitychange', function() {
  if (!document.hidden) {
    updateRoomInfo();
  }
});

// Hàm tự động cập nhật thời gian LIVE và kích hoạt nút copy
function autoUpdateLiveMinutes() {
  if (!currentData || Object.keys(currentData).length === 0) return;
  
  const now = new Date();
  let has45MinLive = false;
  
  // Cập nhật thời gian cho các phiên đang LIVE
  document.querySelectorAll('.live-card, .schedule-table tbody tr').forEach(element => {
    const statusElement = element.querySelector('.card-status, .status-badge');
    
    // Kiểm tra xem có phải phiên LIVE không
    if (statusElement && statusElement.textContent.includes('ĐANG LIVE')) {
      const timeCell = element.querySelector('.card-time, .time-cell');
      if (timeCell) {
        const startTime = timeCell.textContent.split(' - ')[0];
        if (startTime && startTime.includes(':')) {
          const [hours, minutes] = startTime.split(':').map(Number);
          const today = now.toISOString().split('T')[0];
          const startDate = new Date(today);
          startDate.setHours(hours, minutes, 0, 0);
          
          const minutesLive = Math.floor((now - startDate) / (60 * 1000));
          
          // Cập nhật hiển thị thời gian
          const minutesSpan = statusElement.querySelector('span');
          if (minutesSpan) {
            minutesSpan.textContent = `(${minutesLive} phút)`;
          }
          
          // Kiểm tra nếu đã LIVE 45 phút
          if (minutesLive >= 45) {
            has45MinLive = true;
          }
        }
      }
    }
  });
  
  // Nếu có phiên đã LIVE 45 phút, kích hoạt nút copy cho phiên Sắp tới
  if (has45MinLive) {
    enableCopyForUpcomingSessions();
  }
}

// Hàm kích hoạt nút copy cho phiên Sắp tới
function enableCopyForUpcomingSessions() {
  document.querySelectorAll('.status-soon, .status-upcoming').forEach(statusElement => {
    const cardOrRow = statusElement.closest('.live-card, tr');
    if (cardOrRow) {
      let copyBtn = cardOrRow.querySelector('.copy-btn');
      
      // Nếu chưa có nút copy, tạo mới
      if (!copyBtn) {
        const title = cardOrRow.querySelector('.card-title, .title-text')?.textContent || '';
        if (cardOrRow.classList.contains('live-card')) {
          // Card view
          const actionsDiv = cardOrRow.querySelector('.card-actions');
          if (actionsDiv) {
            copyBtn = document.createElement('button');
            copyBtn.className = 'action-btn copy-btn';
            copyBtn.setAttribute('data-title', title);
            copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
            copyBtn.addEventListener('click', function() {
              copyToClipboard(this.dataset.title);
              const btn = this;
              btn.innerHTML = '<i class="fas fa-check"></i> Đã Copy';
              btn.classList.add('copied');
              setTimeout(() => {
                btn.innerHTML = '<i class="fas fa-copy"></i> Copy';
                btn.classList.remove('copied');
              }, 1500);
            });
            actionsDiv.appendChild(copyBtn);
          }
        } else {
          // Table view
          const tdActions = cardOrRow.querySelector('td:last-child .flex');
          if (tdActions) {
            copyBtn = document.createElement('button');
            copyBtn.className = 'action-btn copy-btn';
            copyBtn.setAttribute('data-title', title);
            copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
            copyBtn.addEventListener('click', function() {
              copyToClipboard(this.dataset.title);
            });
            tdActions.appendChild(copyBtn);
          }
        }
      }
      
      // Hiển thị nút copy nếu đã có
      if (copyBtn) {
        copyBtn.style.display = 'flex';
      }
    }
  });
}

// Chạy tự động cập nhật mỗi phút
setInterval(autoUpdateLiveMinutes, 60000);