document.addEventListener("DOMContentLoaded", () => {
  const navButtons = document.querySelectorAll(".nav-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  // SIDEBAR TOGGLE LOGIC
  const sidebarEl = document.getElementById("app-sidebar");
  const mainContentEl = document.querySelector(".main-content");
  const toggleBtn = document.getElementById("sidebar-toggle-btn");
  const closeSidebarBtn = document.getElementById("sidebar-close-btn");

  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      if (window.innerWidth <= 768) {
        sidebarEl.classList.toggle("mobile-open");
      } else {
        sidebarEl.classList.toggle("collapsed");
        mainContentEl.classList.toggle("expanded");
      }
    });
  }

  if (closeSidebarBtn) {
    closeSidebarBtn.addEventListener("click", () => {
      sidebarEl.classList.remove("mobile-open");
      sidebarEl.classList.add("collapsed");
      mainContentEl.classList.add("expanded");
    });
  }

  navButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      navButtons.forEach(b => b.classList.remove("active"));
      tabContents.forEach(t => t.classList.remove("active"));
      btn.classList.add("active");
      const targetTab = document.getElementById(btn.getAttribute("data-tab"));
      if (targetTab) targetTab.classList.add("active");
      if (btn.getAttribute("data-tab") === "analytics-tab") renderCharts();

      if (window.innerWidth <= 768) {
        sidebarEl.classList.remove("mobile-open");
      }
    });
  });

  let workersCache = [];
  let attendanceCache = [];
  let currentDate = new Date();
  let selectedDateStr = "";
  let trendChartInstance = null;
  let ratioChartInstance = null;

  const totalWorkersEl = document.getElementById("kpi-total-workers");
  const presentTodayEl = document.getElementById("kpi-present-today");
  const absentTodayEl = document.getElementById("kpi-absent-today");
  const monthlyCostEl = document.getElementById("kpi-monthly-cost");
  const attendancePctEl = document.getElementById("kpi-attendance-pct");
  const workerForm = document.getElementById("worker-form");
  const workersDirectoryEl = document.getElementById("workers-directory-list");
  const advanceWorkerSelect = document.getElementById("advance-worker-select");
  const calendarDaysEl = document.getElementById("calendar-days");
  const calendarMonthTitleEl = document.getElementById("calendar-month-title");
  const modalEl = document.getElementById("attendance-modal");

  const todayObj = new Date();
  const firstDayStr = new Date(todayObj.getFullYear(), todayObj.getMonth(), 1).toISOString().split('T')[0];
  const lastDayStr = new Date(todayObj.getFullYear(), todayObj.getMonth() + 1, 0).toISOString().split('T')[0];
  if(document.getElementById("report-start-date")) document.getElementById("report-start-date").value = firstDayStr;
  if(document.getElementById("report-end-date")) document.getElementById("report-end-date").value = lastDayStr;

  renderCalendar();
  loadAppData();

  async function loadAppData() {
    try {
      const cachedWorkers = localStorage.getItem("sar_workers");
      const cachedAttendance = localStorage.getItem("sar_attendance");

      if (cachedWorkers) {
        workersCache = JSON.parse(cachedWorkers);
        updateUIState();
      }
      if (cachedAttendance) {
        attendanceCache = JSON.parse(cachedAttendance);
        updateDashboardKPIs();
      }

      if (typeof CONFIG === "undefined" || !CONFIG.API_URL || CONFIG.API_URL.includes("YOUR_")) {
        console.warn("CONFIG.API_URL is not set.");
        return;
      }

      const [wRes, aRes] = await Promise.all([
        fetch(`${CONFIG.API_URL}?action=workers`).catch(() => null),
        fetch(`${CONFIG.API_URL}?action=attendance`).catch(() => null)
      ]);

      if (wRes && wRes.ok) {
        const wJson = await wRes.json();
        if (wJson.status === "success") {
          workersCache = wJson.data.filter(w => w["Status"] !== "Archived");
          localStorage.setItem("sar_workers", JSON.stringify(workersCache));
          updateUIState();
        }
      }

      if (aRes && aRes.ok) {
        const aJson = await aRes.json();
        if (aJson.status === "success") {
          attendanceCache = aJson.data;
          localStorage.setItem("sar_attendance", JSON.stringify(attendanceCache));
          updateDashboardKPIs();
        }
      }
    } catch (err) {
      console.warn("Data sync warning:", err);
    }
  }

  function updateUIState() {
    if (totalWorkersEl) totalWorkersEl.textContent = workersCache.length;
    renderWorkersDirectory();
    populateAdvanceWorkerDropdown();
  }

  function updateDashboardKPIs() {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayRecords = attendanceCache.filter(r => String(r["Date"]).split("T")[0] === todayStr);
    
    const presentCount = todayRecords.filter(r => r["Status"] === "Present" || r["Status"] === "Paid Leave").length;
    const absentCount = todayRecords.filter(r => r["Status"] === "Absent" || r["Status"] === "Unpaid Leave").length;
    
    if (presentTodayEl) presentTodayEl.textContent = presentCount;
    if (absentTodayEl) absentTodayEl.textContent = absentCount;

    let totalMonthCost = attendanceCache.reduce((sum, r) => sum + (parseFloat(r["Calculated Wage"]) || 0), 0);
    if (monthlyCostEl) monthlyCostEl.textContent = `₹${totalMonthCost.toFixed(0)}`;

    let totalRecorded = attendanceCache.length;
    let totalPresentOrLeave = attendanceCache.filter(r => ["Present", "Paid Leave", "Half Day"].includes(r["Status"])).length;
    let pct = totalRecorded > 0 ? ((totalPresentOrLeave / totalRecorded) * 100).toFixed(1) : 0;
    if (attendancePctEl) attendancePctEl.textContent = `${pct}%`;
  }

  function renderWorkersDirectory() {
    if (!workersDirectoryEl) return;
    if (workersCache.length === 0) {
      workersDirectoryEl.innerHTML = "<p>No active workers found.</p>";
      return;
    }
    let html = `<table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
      <tr style="background:var(--bg-color); text-align:left;">
        <th style="padding:8px;">Name</th><th style="padding:8px;">Category</th><th style="padding:8px;">Wage</th><th style="padding:8px;">Site</th>
      </tr>`;
    workersCache.forEach(w => {
      html += `<tr style="border-bottom:1px solid var(--border-color);">
        <td style="padding:8px;"><strong>${w["Worker Name"]}</strong><br><small>${w["Mobile Number"]}</small></td>
        <td style="padding:8px;">${w["Category"]}</td>
        <td style="padding:8px;">₹${w["Daily Wage"]}</td>
        <td style="padding:8px;">${w["Site ID"]}</td>
      </tr>`;
    });
    html += `</table>`;
    workersDirectoryEl.innerHTML = html;
  }

  function populateAdvanceWorkerDropdown() {
    if (!advanceWorkerSelect) return;
    advanceWorkerSelect.innerHTML = '<option value="">Select Worker</option>';
    workersCache.forEach(w => {
      advanceWorkerSelect.innerHTML += `<option value="${w["Worker ID"]}">${w["Worker Name"]} (${w["Category"]})</option>`;
    });
  }

  if (document.getElementById("prev-month")) {
    document.getElementById("prev-month").addEventListener("click", () => { currentDate.setMonth(currentDate.getMonth() - 1); renderCalendar(); });
    document.getElementById("next-month").addEventListener("click", () => { currentDate.setMonth(currentDate.getMonth() + 1); renderCalendar(); });
    document.getElementById("close-modal").addEventListener("click", () => { modalEl.style.display = "none"; });
  }

  function renderCalendar() {
    if (!calendarDaysEl) return;
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    if (calendarMonthTitleEl) calendarMonthTitleEl.textContent = `${monthNames[month]} ${year}`;

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    let html = "";
    for (let i = 0; i < firstDayIndex; i++) html += `<div class="calendar-day empty"></div>`;

    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      html += `<div class="calendar-day" data-date="${dateStr}"><span class="day-num">${day}</span><span class="day-status">Mark Attendance</span></div>`;
    }
    calendarDaysEl.innerHTML = html;

    document.querySelectorAll(".calendar-day[data-date]").forEach(cell => {
      cell.addEventListener("click", () => {
        selectedDateStr = cell.getAttribute("data-date");
        openAttendanceModal(selectedDateStr);
      });
    });
  }

  function openAttendanceModal(dateStr) {
    if (!modalEl) return;
    document.getElementById("modal-date-title").textContent = `Attendance for ${dateStr}`;
    modalEl.style.display = "flex";

    let html = "";
    if (workersCache.length === 0) {
      html = "<p>Please add workers in the Worker Management tab first.</p>";
    } else {
      workersCache.forEach(w => {
        const existing = attendanceCache.find(r => String(r["Date"]).split("T")[0] === dateStr && r["Worker ID"] === w["Worker ID"]);
        const status = existing ? existing["Status"] : "Present";
        const ot = existing ? existing["OT Hours"] : 0;

        html += `<div class="attendance-row" data-worker-id="${w["Worker ID"]}" data-worker-name="${w["Worker Name"]}" data-wage="${w["Daily Wage"]}" data-ot-rate="${w["Overtime Rate"] || 0}">
          <div><strong>${w["Worker Name"]}</strong><br><small>₹${w["Daily Wage"]}/day</small></div>
          <div class="attendance-options" style="display: flex; gap: 8px; font-size: 0.8rem; align-items: center;">
            <label><input type="radio" name="status-${w["Worker ID"]}" value="Present" ${status==="Present"?"checked":""}> Pr</label>
            <label><input type="radio" name="status-${w["Worker ID"]}" value="Absent" ${status==="Absent"?"checked":""}> Ab</label>
            <label><input type="radio" name="status-${w["Worker ID"]}" value="Half Day" ${status==="Half Day"?"checked":""}> Half</label>
            <label><input type="radio" name="status-${w["Worker ID"]}" value="Paid Leave" ${status==="Paid Leave"?"checked":""}> Paid</label>
          </div>
          <div><input type="number" class="ot-hours" value="${ot}" min="0" step="0.5" style="width: 55px; padding:4px;"></div>
          <div class="calculated-earnings">₹${w["Daily Wage"]}</div>
        </div>`;
      });
    }
    document.getElementById("attendance-workers-container").innerHTML = html;
  }

  const saveAttBtn = document.getElementById("save-attendance-btn");
  if (saveAttBtn) {
    saveAttBtn.addEventListener("click", async () => {
      saveAttBtn.textContent = "Saving...";
      saveAttBtn.disabled = true;
      const rows = document.querySelectorAll(".attendance-row");
      
      for (const row of rows) {
        const workerId = row.getAttribute("data-worker-id");
        const selectedRadio = row.querySelector(`input[name="status-${workerId}"]:checked`);
        const status = selectedRadio ? selectedRadio.value : "Present";
        const otHours = parseFloat(row.querySelector(".ot-hours").value) || 0;
        const wage = parseFloat(row.getAttribute("data-wage")) || 0;
        const otRate = parseFloat(row.getAttribute("data-ot-rate")) || 0;

        let base = (status === "Present" || status === "Paid Leave") ? wage : (status === "Half Day" ? wage * 0.5 : 0);
        const calculatedWage = base + (otHours * otRate);

        const payload = {
          "Attendance ID": `ATT-${selectedDateStr.replace(/-/g, '')}-${workerId}`,
          "Date": selectedDateStr,
          "Worker ID": workerId,
          "Worker Name": row.getAttribute("data-worker-name"),
          "Site ID": "SITE-1",
          "Status": status,
          "OT Hours": otHours,
          "Daily Wage": wage,
          "Calculated Wage": calculatedWage,
          "Created At": new Date().toISOString(),
          "Updated At": new Date().toISOString(),
          "Marked By": "Admin"
        };

        if (typeof CONFIG !== "undefined" && CONFIG.API_URL) {
          await fetch(CONFIG.API_URL, {
            method: "POST",
            body: JSON.stringify({ action: "insert", sheet: "Attendance", data: payload })
          }).catch(e => console.error(e));
        }
      }
      alert("Attendance saved successfully!");
      modalEl.style.display = "none";
      localStorage.removeItem("sar_attendance");
      loadAppData();
      saveAttBtn.textContent = "Save Attendance";
      saveAttBtn.disabled = false;
    });
  }

  if (workerForm) {
    workerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const workerId = "WRK-" + Math.floor(1000 + Math.random() * 9000);
      const workerData = {
        "Worker ID": workerId,
        "Worker Name": document.getElementById("worker-name").value,
        "Mobile Number": document.getElementById("mobile").value,
        "Category": document.getElementById("category").value,
        "Site ID": document.getElementById("site-name").value,
        "Daily Wage": document.getElementById("daily-wage").value,
        "Overtime Rate": document.getElementById("ot-rate").value,
        "Advance Balance": 0,
        "Join Date": new Date().toISOString().split('T')[0],
        "Status": "Active",
        "Notes": document.getElementById("notes") ? document.getElementById("notes").value : ""
      };

      const btn = document.getElementById("save-worker-btn");
      if (btn) { btn.textContent = "Saving..."; btn.disabled = true; }

      try {
        if (typeof CONFIG !== "undefined" && CONFIG.API_URL) {
          await fetch(CONFIG.API_URL, {
            method: "POST",
            body: JSON.stringify({ action: "insert", sheet: "Workers", data: workerData })
          });
        }
        workerForm.reset();
        localStorage.removeItem("sar_workers");
        loadAppData();
        alert("Worker added successfully!");
      } catch (err) {
        alert("Error: " + err.message);
      } finally {
        if (btn) { btn.textContent = "Save Worker"; btn.disabled = false; }
      }
    });
  }

  const generateReportBtn = document.getElementById("generate-report-btn");
  if (generateReportBtn) {
    generateReportBtn.addEventListener("click", () => {
      const type = document.getElementById("report-type").value;
      const startDate = document.getElementById("report-start-date").value;
      const endDate = document.getElementById("report-end-date").value;
      const outputEl = document.getElementById("report-output");

      let filteredRecords = attendanceCache;
      if (startDate && endDate) {
        filteredRecords = attendanceCache.filter(r => {
          const rDate = String(r["Date"]).split("T")[0];
          return rDate >= startDate && rDate <= endDate;
        });
      }

      let html = `<h3>Report: ${type.toUpperCase()} (${startDate || 'Start'} to ${endDate || 'End'})</h3>`;
      
      if (type === "worker") {
        html += `<table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:0.85rem;">`;
        html += `<tr style="background:#f1f5f9;"><th style="padding:6px;">Worker ID</th><th style="padding:6px;">Name</th><th style="padding:6px;">Category</th><th style="padding:6px;">Daily Wage</th><th style="padding:6px;">Days Present</th><th style="padding:6px;">Total Earned (Filtered)</th></tr>`;
        
        let grandTotalWorkerWages = 0;
        let grandTotalDaysPresent = 0;

        workersCache.forEach(w => {
          const workerRecords = filteredRecords.filter(r => r["Worker ID"] === w["Worker ID"]);
          const daysPresentCount = workerRecords.filter(r => ["Present", "Paid Leave", "Half Day"].includes(r["Status"])).length;
          const workerTotal = workerRecords.reduce((sum, r) => sum + (parseFloat(r["Calculated Wage"]) || 0), 0);
          
          grandTotalWorkerWages += workerTotal;
          grandTotalDaysPresent += daysPresentCount;

          html += `<tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:6px;">${w["Worker ID"]}</td>
            <td style="padding:6px;">${w["Worker Name"]}</td>
            <td style="padding:6px;">${w["Category"]}</td>
            <td style="padding:6px;">₹${w["Daily Wage"]}</td>
            <td style="padding:6px; font-weight:bold;">${daysPresentCount} days</td>
            <td style="padding:6px; font-weight:bold; color:#2563eb;">₹${workerTotal.toFixed(2)}</td>
          </tr>`;
        });
        html += `</table>`;
        html += `<div style="margin-top: 15px; text-align: right; font-weight: bold; font-size: 1rem;">Total Days Worked: ${grandTotalDaysPresent} | Grand Total Wages: ₹${grandTotalWorkerWages.toFixed(2)}</div>`;
      
      } else {
        html += `<table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:0.85rem;">`;
        html += `<tr style="background:#f1f5f9;"><th style="padding:6px;">Date</th><th style="padding:6px;">Worker</th><th style="padding:6px;">Status</th><th style="padding:6px;">OT Hours</th><th style="padding:6px;">Wage</th></tr>`;
        
        let totalWageSum = 0;
        let attendanceDaysCount = filteredRecords.filter(r => ["Present", "Paid Leave", "Half Day"].includes(r["Status"])).length;

        filteredRecords.forEach(r => {
          const wage = parseFloat(r["Calculated Wage"]) || 0;
          totalWageSum += wage;
          html += `<tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:6px;">${String(r["Date"]).split("T")[0]}</td>
            <td style="padding:6px;">${r["Worker Name"]}</td>
            <td style="padding:6px;">${r["Status"]}</td>
            <td style="padding:6px;">${r["OT Hours"] || 0}</td>
            <td style="padding:6px;">₹${wage.toFixed(2)}</td>
          </tr>`;
        });
        html += `</table>`;
        html += `<div style="margin-top: 15px; text-align: right; font-weight: bold; font-size: 1rem;">Total Attendance Records: ${attendanceDaysCount} Days | Total Wage Expense: ₹${totalWageSum.toFixed(2)}</div>`;
      }

      // Add branding footer to report preview
      html += `<div style="margin-top: 30px; padding-top: 10px; border-top: 1px dashed #cbd5e1; text-align: center; font-size: 0.8rem; color: #64748b;">Report generated & certified by <strong>arrowX Softwares</strong></div>`;

      outputEl.innerHTML = html;
    });
  }

  const exportPdfBtn = document.getElementById("export-pdf-btn");
  if (exportPdfBtn) {
    exportPdfBtn.addEventListener("click", () => {
      const reportOutput = document.getElementById("report-output");
      if (!reportOutput || !reportOutput.innerHTML.trim()) {
        alert("Please generate a report first before exporting.");
        return;
      }
      const printWindow = window.open('', '_blank', 'width=800,height=600');
      printWindow.document.write(`
        <html>
          <head>
            <title>Site Attendance Report - arrowX Softwares</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; color: #333; display: flex; flex-direction: column; min-height: 95vh; }
              .report-body { flex: 1; }
              h2, h3 { text-align: center; color: #111; }
              table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f4f4f4; }
              .print-footer { margin-top: 40px; padding-top: 10px; border-top: 1px solid #aaa; text-align: center; font-size: 11px; color: #555; }
            </style>
          </head>
          <body>
            <div class="report-body">
              <h2>SAR Construction Management</h2>
              ${reportOutput.innerHTML}
            </div>
            <div class="print-footer">
              Official Report Generated by <strong>arrowX Softwares</strong>
            </div>
            <script>
              window.onload = function() {
                window.print();
                setTimeout(() => window.close(), 500);
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    });
  }

  function renderCharts() {
    const trendCtx = document.getElementById("trendChart");
    const ratioCtx = document.getElementById("ratioChart");
    if (!trendCtx || !ratioCtx) return;

    const presentCount = attendanceCache.filter(r => r["Status"] === "Present").length;
    const absentCount = attendanceCache.filter(r => r["Status"] === "Absent").length;

    if (trendChartInstance) trendChartInstance.destroy();
    if (ratioChartInstance) ratioChartInstance.destroy();

    trendChartInstance = new Chart(trendCtx, {
      type: 'line',
      data: {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        datasets: [{ label: 'Labour Cost Trend', data: [12000, 19000, 15000, 22000], borderColor: '#2563eb', tension: 0.1 }]
      }
    });

    ratioChartInstance = new Chart(ratioCtx, {
      type: 'doughnut',
      data: {
        labels: ['Present', 'Absent'],
        datasets: [{ data: [presentCount || 10, absentCount || 2], backgroundColor: ['#22c55e', '#ef4444'] }]
      }
    });
  }
});
