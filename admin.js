const API_BASE_URL = ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? window.location.origin
    : window.location.hostname.startsWith("test.")
    ? "https://api-test.bluebengal-carshalton.co.uk"
    : "https://api.bluebengal-carshalton.co.uk";

const NOTIF_SEEN_KEY = "bb_admin_notif_last_seen";
const SESSION_KEY = "bb_admin_key";

const state = {
    adminKey: sessionStorage.getItem(SESSION_KEY) || "",
    bookings: [],
    blockedSlots: [],
    emailLog: [],
    vouchers: [],
    selectedCustomerIds: new Set(),
    closedWeekdays: [],
    activeQuick: "upcoming",
    bookingsViewMode: localStorage.getItem("bb_admin_view_mode") || "cards",
};

const els = {
    loginScreen: document.getElementById("loginScreen"),
    loginForm: document.getElementById("loginForm"),
    loginError: document.getElementById("loginError"),
    adminKeyInput: document.getElementById("adminKeyInput"),
    adminApp: document.getElementById("adminApp"),
    pageTitle: document.getElementById("pageTitle"),
    todayDate: document.getElementById("todayDate"),
    refreshBtn: document.getElementById("refreshBtn"),
    logoutBtn: document.getElementById("logoutBtn"),
    notifBadge: document.getElementById("notifBadge"),

    statTotal: document.getElementById("statTotal"),
    statPending: document.getElementById("statPending"),
    statConfirmed: document.getElementById("statConfirmed"),
    statUpcoming: document.getElementById("statUpcoming"),
    needsAttentionPanel: document.getElementById("needsAttentionPanel"),
    needsAttentionList: document.getElementById("needsAttentionList"),
    upcomingList: document.getElementById("upcomingList"),

    customerSearch: document.getElementById("customerSearch"),
    customersTableBody: document.getElementById("customersTableBody"),

    quickFilters: document.getElementById("quickFilters"),
    statusFilter: document.getElementById("statusFilter"),
    dateFilter: document.getElementById("dateFilter"),
    searchFilter: document.getElementById("searchFilter"),
    bookingsTableBody: document.getElementById("bookingsTableBody"),
    bookingsCardsWrap: document.getElementById("bookingsCardsWrap"),
    bookingsListWrap: document.getElementById("bookingsListWrap"),
    viewToggle: document.getElementById("viewToggle"),
    datePrevBtn: document.getElementById("datePrevBtn"),
    dateNextBtn: document.getElementById("dateNextBtn"),
    dateNavLabel: document.getElementById("dateNavLabel"),
    emergencyBlockToggle: document.getElementById("emergencyBlockToggle"),

    autoAcceptToggle: document.getElementById("autoAcceptToggle"),
    openingTimeInput: document.getElementById("openingTimeInput"),
    closingTimeInput: document.getElementById("closingTimeInput"),
    slotIntervalInput: document.getElementById("slotIntervalInput"),
    minGuestsInput: document.getElementById("minGuestsInput"),
    maxGuestsInput: document.getElementById("maxGuestsInput"),
    maxCoversInput: document.getElementById("maxCoversInput"),
    minAdvanceNoticeInput: document.getElementById("minAdvanceNoticeInput"),
    confirmationMessageInput: document.getElementById("confirmationMessageInput"),
    saveSettingsBtn: document.getElementById("saveSettingsBtn"),
    saveStatus: document.getElementById("saveStatus"),

    statRepeat: document.getElementById("statRepeat"),

    blockDateInput: document.getElementById("blockDateInput"),
    blockWholeDayInput: document.getElementById("blockWholeDayInput"),
    blockStartInput: document.getElementById("blockStartInput"),
    blockEndInput: document.getElementById("blockEndInput"),
    blockReasonInput: document.getElementById("blockReasonInput"),
    addBlockedSlotBtn: document.getElementById("addBlockedSlotBtn"),
    blockedSlotsList: document.getElementById("blockedSlotsList"),
    closedWeekdaysGroup: document.getElementById("closedWeekdaysGroup"),

    voucherCodeInput: document.getElementById("voucherCodeInput"),
    generateVoucherCodeBtn: document.getElementById("generateVoucherCodeBtn"),
    voucherDescriptionInput: document.getElementById("voucherDescriptionInput"),
    voucherTypeInput: document.getElementById("voucherTypeInput"),
    voucherValueInput: document.getElementById("voucherValueInput"),
    voucherMaxInput: document.getElementById("voucherMaxInput"),
    voucherExpiryInput: document.getElementById("voucherExpiryInput"),
    voucherFormError: document.getElementById("voucherFormError"),
    createVoucherBtn: document.getElementById("createVoucherBtn"),
    vouchersTableBody: document.getElementById("vouchersTableBody"),
    sendVoucherSelect: document.getElementById("sendVoucherSelect"),
    selectRepeatCustomersBtn: document.getElementById("selectRepeatCustomersBtn"),
    selectAllCustomersBtn: document.getElementById("selectAllCustomersBtn"),
    clearCustomerSelectionBtn: document.getElementById("clearCustomerSelectionBtn"),
    voucherRecipientsList: document.getElementById("voucherRecipientsList"),
    sendVoucherBtn: document.getElementById("sendVoucherBtn"),
    voucherSendStatus: document.getElementById("voucherSendStatus"),

    notificationsList: document.getElementById("notificationsList"),
    emailLogList: document.getElementById("emailLogList"),

    reminderEnabledToggle: document.getElementById("reminderEnabledToggle"),
    reminderHoursInput: document.getElementById("reminderHoursInput"),
    feedbackEnabledToggle: document.getElementById("feedbackEnabledToggle"),
    feedbackHoursInput: document.getElementById("feedbackHoursInput"),
    feedbackLinkInput: document.getElementById("feedbackLinkInput"),
    saveReminderSettingsBtn: document.getElementById("saveReminderSettingsBtn"),
    reminderSaveStatus: document.getElementById("reminderSaveStatus"),

    bookingModal: document.getElementById("bookingModal"),
    bookingModalContent: document.getElementById("bookingModalContent"),
};

// Never use toISOString() here — it converts to UTC, which silently shifts
// the calendar date backward during BST (UTC+1). Always read back the local
// date components instead.
function toLocalDateStr(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function todayStr() {
    return toLocalDateStr(new Date());
}

function formatDate(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
        weekday: "short", day: "numeric", month: "short", year: "numeric",
    });
}

function formatTime(timeStr) {
    const [h, m] = timeStr.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const displayHour = h % 12 === 0 ? 12 : h % 12;
    return `${displayHour}:${String(m).padStart(2, "0")} ${ampm}`;
}

async function apiFetch(path, options = {}) {
    const res = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: {
            "x-admin-key": state.adminKey,
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
    });

    if (res.status === 401) {
        sessionStorage.removeItem(SESSION_KEY);
        state.adminKey = "";
        showLogin("Your session has expired. Please sign in again.");
        throw new Error("Unauthorized");
    }

    const data = await res.json();
    if (!res.ok || !data.success) {
        throw new Error(data.message || "Request failed.");
    }
    return data;
}

function showLogin(errorMessage) {
    els.adminApp.hidden = true;
    els.loginScreen.hidden = false;
    if (errorMessage) {
        els.loginError.textContent = errorMessage;
        els.loginError.hidden = false;
    } else {
        els.loginError.hidden = true;
    }
}

function showApp() {
    els.loginScreen.hidden = true;
    els.adminApp.hidden = false;
    els.todayDate.textContent = new Date().toLocaleDateString("en-GB", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
}

async function attemptLogin(key) {
    state.adminKey = key;
    try {
        await apiFetch("/api/admin/settings");
        sessionStorage.setItem(SESSION_KEY, key);
        showApp();
        await loadEverything();
    } catch (err) {
        state.adminKey = "";
        showLogin("Invalid admin key. Please try again.");
    }
}

els.loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    attemptLogin(els.adminKeyInput.value.trim());
});

els.logoutBtn.addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_KEY);
    state.adminKey = "";
    state.bookings = [];
    showLogin();
});

els.refreshBtn.addEventListener("click", () => loadEverything());

// --- Tab navigation ---
const adminNav = document.getElementById("adminNav");
const adminNavToggle = document.getElementById("adminNavToggle");
const activeTabLabel = document.getElementById("activeTabLabel");

document.querySelectorAll(".admin-nav button[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".admin-nav button[data-tab]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        document.querySelectorAll(".admin-tab").forEach((tab) => (tab.hidden = true));
        const tab = document.getElementById(`tab-${btn.dataset.tab}`);
        tab.hidden = false;
        const label = btn.textContent.trim().replace(/\d+$/, "").trim();
        els.pageTitle.textContent = label;
        activeTabLabel.textContent = label;

        if (btn.dataset.tab === "notifications") {
            localStorage.setItem(NOTIF_SEEN_KEY, Date.now().toString());
            renderNotifBadge();
        }

        // On mobile the nav is a dropdown — collapse it once a tab is picked.
        adminNav.classList.remove("open");
        adminNavToggle.setAttribute("aria-expanded", "false");
    });
});

adminNavToggle.addEventListener("click", () => {
    const isOpen = adminNav.classList.toggle("open");
    adminNavToggle.setAttribute("aria-expanded", String(isOpen));
});

// --- Data loading ---
async function loadEverything() {
    await Promise.all([loadBookings(), loadSettings(), loadBlockedSlots(), loadEmailLog(), loadVouchers()]);
    renderOverview();
    renderBookings();
    renderCustomersTable();
    renderNotifications();
    renderNotifBadge();
    renderBlockedSlots();
    renderEmailLog();
    renderVouchersTable();
    renderVoucherSendOptions();
    renderVoucherRecipients();
}

async function loadVouchers() {
    const data = await apiFetch("/api/admin/vouchers");
    state.vouchers = data.vouchers;
}

async function loadEmailLog() {
    const data = await apiFetch("/api/admin/email-log");
    state.emailLog = data.emailLog;
}

const EMAIL_TYPE_LABELS = {
    reminder: "Reminder",
    feedback: "Feedback request",
    voucher: "Voucher",
    confirmation: "Confirmation",
    cancellation: "Cancellation",
};

function renderEmailLog() {
    els.emailLogList.innerHTML = state.emailLog.length
        ? state.emailLog
              .map(
                  (e) => `
            <div class="email-log-item">
                <div class="notification-text">
                    <strong>${EMAIL_TYPE_LABELS[e.email_type] || e.email_type}</strong> to ${escapeHtml(e.recipient)}
                    <span class="meta">${escapeHtml(e.subject)} ${e.booking_code ? `· ${e.booking_code}` : ""} · ${new Date(e.created_at).toLocaleString("en-GB")}</span>
                </div>
                <span class="email-status email-status-${e.status}">${e.status}</span>
            </div>`
              )
              .join("")
        : `<p class="panel-empty">No automated emails have been triggered yet.</p>`;
}

// --- Customers (derived from the bookings already loaded, no extra request needed) ---
function deriveCustomers() {
    const today = todayStr();
    const byCustomer = new Map();

    for (const b of state.bookings) {
        if (!byCustomer.has(b.customer_id)) {
            byCustomer.set(b.customer_id, {
                id: b.customer_id,
                name: b.name,
                email: b.email,
                phone: b.phone,
                marketingConsent: b.marketing_consent,
                count: b.customer_booking_count,
                bookings: [],
            });
        }
        byCustomer.get(b.customer_id).bookings.push(b);
    }

    return [...byCustomer.values()].map((c) => {
        const sorted = [...c.bookings].sort((a, b) => (a.booking_date + a.booking_time) < (b.booking_date + b.booking_time) ? 1 : -1);
        const lastVisit = sorted.find((b) => b.booking_date <= today) || sorted[sorted.length - 1];
        const nextUpcoming = c.bookings
            .filter((b) => b.booking_date >= today && b.status !== "cancelled" && b.status !== "rejected")
            .sort((a, b) => (a.booking_date + a.booking_time) > (b.booking_date + b.booking_time) ? 1 : -1)[0];
        return { ...c, lastVisit, nextUpcoming };
    });
}

function renderCustomersTable() {
    const search = els.customerSearch.value.trim().toLowerCase();
    const customers = deriveCustomers()
        .filter((c) => {
            if (!search) return true;
            return `${c.name} ${c.email} ${c.phone}`.toLowerCase().includes(search);
        })
        .sort((a, b) => b.count - a.count);

    els.customersTableBody.innerHTML = customers.length
        ? customers
              .map(
                  (c) => `
            <tr data-customer-id="${c.id}">
                <td data-label="Name">${escapeHtml(c.name)} ${c.count > 1 ? `<span class="visit-badge repeat">×${c.count}</span>` : ""}</td>
                <td data-label="Email">${escapeHtml(c.email)}</td>
                <td data-label="Phone">${escapeHtml(c.phone)}</td>
                <td data-label="Bookings">${c.count}</td>
                <td data-label="Last Visit">${c.lastVisit ? formatDate(c.lastVisit.booking_date) : "—"}</td>
                <td data-label="Next Upcoming">${c.nextUpcoming ? formatDate(c.nextUpcoming.booking_date) : "—"}</td>
                <td data-label="Marketing"><span class="visit-badge ${c.marketingConsent ? "repeat" : ""}">${c.marketingConsent ? "Opted in" : "Opted out"}</span></td>
            </tr>`
              )
              .join("")
        : `<tr><td colspan="7" class="panel-empty">No customers match this search.</td></tr>`;
}

els.customerSearch.addEventListener("input", renderCustomersTable);

els.customersTableBody.addEventListener("click", (e) => {
    const row = e.target.closest("tr[data-customer-id]");
    if (!row) return;
    openCustomerModal(row.dataset.customerId);
});

function openCustomerModal(customerId) {
    const customer = deriveCustomers().find((c) => String(c.id) === String(customerId));
    if (!customer) return;
    const history = [...customer.bookings].sort((a, b) => (a.booking_date + a.booking_time) < (b.booking_date + b.booking_time) ? 1 : -1);

    els.bookingModalContent.innerHTML = `
        <h2>${escapeHtml(customer.name)}</h2>
        <div class="modal-row"><span>Email</span><strong>${escapeHtml(customer.email)}</strong></div>
        <div class="modal-row"><span>Phone</span><strong>${escapeHtml(customer.phone)}</strong></div>
        <div class="modal-row"><span>Total Bookings</span><strong>${customer.count}</strong></div>
        <h2 style="margin-top:20px; font-size:1.05rem;">Booking History</h2>
        ${history
            .map(
                (b) => `
            <div class="upcoming-row">
                <div>
                    <div class="who">${formatDate(b.booking_date)} at ${formatTime(b.booking_time)}</div>
                    <div class="when">${b.guests} guests · ${b.booking_code}</div>
                </div>
                <span class="status-badge status-${b.status}">${b.status}</span>
            </div>`
            )
            .join("")}
        <div class="modal-close"><button id="closeModalBtn">Close</button></div>
    `;
    els.bookingModal.hidden = false;
    document.getElementById("closeModalBtn").addEventListener("click", () => {
        els.bookingModal.hidden = true;
    });
}

async function loadBookings() {
    const data = await apiFetch("/api/admin/bookings");
    state.bookings = data.bookings;
}

async function loadSettings() {
    const data = await apiFetch("/api/admin/settings");
    const s = data.settings;
    els.autoAcceptToggle.checked = s.auto_accept_bookings;
    els.openingTimeInput.value = s.opening_time.slice(0, 5);
    els.closingTimeInput.value = s.closing_time.slice(0, 5);
    els.slotIntervalInput.value = String(s.slot_interval_minutes);
    els.minGuestsInput.value = s.min_guests_per_booking;
    els.maxGuestsInput.value = s.max_guests_per_booking;
    els.maxCoversInput.value = s.max_covers_per_slot === null ? "" : s.max_covers_per_slot;
    els.minAdvanceNoticeInput.value = String(s.min_advance_notice_minutes);
    els.confirmationMessageInput.value = s.confirmation_message;

    els.reminderEnabledToggle.checked = s.reminder_enabled;
    els.reminderHoursInput.value = String(s.reminder_hours_before);
    els.feedbackEnabledToggle.checked = s.feedback_enabled;
    els.feedbackHoursInput.value = String(s.feedback_hours_after);
    els.feedbackLinkInput.value = s.feedback_link;

    state.closedWeekdays = [...s.closed_weekdays];
    document.querySelectorAll("#closedWeekdaysGroup .chip").forEach((chip) => {
        chip.classList.toggle("active", state.closedWeekdays.includes(Number(chip.dataset.weekday)));
    });
}

async function loadBlockedSlots() {
    const data = await apiFetch("/api/admin/blocked-slots");
    state.blockedSlots = data.blockedSlots;
}

// --- Overview ---
function renderOverview() {
    const today = todayStr();
    const weekAhead = new Date();
    weekAhead.setDate(weekAhead.getDate() + 7);
    const weekAheadStr = toLocalDateStr(weekAhead);

    const pending = state.bookings.filter((b) => b.status === "pending");
    const confirmed = state.bookings.filter((b) => b.status === "confirmed");
    const upcoming = state.bookings.filter(
        (b) => b.booking_date >= today && b.booking_date <= weekAheadStr && b.status !== "cancelled" && b.status !== "rejected"
    );

    const repeatCustomerIds = new Set(
        state.bookings.filter((b) => b.customer_booking_count > 1).map((b) => b.customer_id)
    );

    els.statTotal.textContent = state.bookings.length;
    els.statPending.textContent = pending.length;
    els.statConfirmed.textContent = confirmed.length;
    els.statUpcoming.textContent = upcoming.length;
    els.statRepeat.textContent = repeatCustomerIds.size;

    if (pending.length > 0) {
        els.needsAttentionPanel.hidden = false;
        els.needsAttentionList.innerHTML = pending
            .slice(0, 5)
            .map(
                (b) => `
            <div class="upcoming-row">
                <div>
                    <div class="who">${escapeHtml(b.name)} — ${b.guests} guests</div>
                    <div class="when">${formatDate(b.booking_date)} at ${formatTime(b.booking_time)}</div>
                </div>
                <div class="row-actions">
                    <button class="action-confirm" data-action="confirmed" data-id="${b.id}">Confirm</button>
                    <button class="action-reject" data-action="rejected" data-id="${b.id}">Reject</button>
                </div>
            </div>`
            )
            .join("");
    } else {
        els.needsAttentionPanel.hidden = true;
    }

    const upcomingSorted = state.bookings
        .filter((b) => b.booking_date >= today && b.status !== "cancelled" && b.status !== "rejected")
        .slice(0, 6);

    els.upcomingList.innerHTML = upcomingSorted.length
        ? upcomingSorted
              .map(
                  (b) => `
            <div class="upcoming-row">
                <div>
                    <div class="who">${escapeHtml(b.name)} — ${b.guests} guests</div>
                    <div class="when">${formatDate(b.booking_date)} at ${formatTime(b.booking_time)} · ${b.booking_code}</div>
                </div>
                <span class="status-badge status-${b.status}">${b.status}</span>
            </div>`
              )
              .join("")
        : `<p class="panel-empty">No upcoming bookings.</p>`;
}

// --- Bookings table ---
function addDays(dateStr, days) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    return toLocalDateStr(dt);
}

function focusDate() {
    return els.dateFilter.value || todayStr();
}

function getFilteredBookings() {
    const status = els.statusFilter.value;
    const date = els.dateFilter.value;
    const search = els.searchFilter.value.trim().toLowerCase();
    const today = todayStr();
    const weekEnd = state.activeQuick === "week" ? addDays(today, 6) : null;

    return state.bookings.filter((b) => {
        if (status && b.status !== status) return false;
        if (date && b.booking_date !== date) return false;
        if (state.activeQuick === "upcoming" && b.booking_date < today) return false;
        if (state.activeQuick === "week" && (b.booking_date < today || b.booking_date > weekEnd)) return false;
        if (search) {
            const haystack = `${b.name} ${b.email} ${b.phone}`.toLowerCase();
            if (!haystack.includes(search)) return false;
        }
        return true;
    });
}

// Dispatches to whichever view mode (cards or compact list) is active —
// call this instead of renderBookingsTable() directly after any data change.
function renderBookings() {
    if (state.bookingsViewMode === "list") {
        els.bookingsCardsWrap.hidden = true;
        els.bookingsListWrap.hidden = false;
        renderBookingsList();
    } else {
        els.bookingsCardsWrap.hidden = false;
        els.bookingsListWrap.hidden = true;
        renderBookingsTable();
    }
    updateDateNav();
}

function contextualEmptyMessage() {
    if (state.activeQuick === "today") return "No bookings for Today.";
    if (state.activeQuick === "tomorrow") return "No bookings for Tomorrow.";
    if (state.activeQuick === "week") return "No bookings this week.";
    if (state.activeQuick === "upcoming") return "No upcoming bookings.";
    if (els.dateFilter.value) return `No bookings for ${formatDate(els.dateFilter.value)}.`;
    return "No bookings match these filters.";
}

function renderBookingsList() {
    const rows = getFilteredBookings();
    els.bookingsListWrap.innerHTML = rows.length
        ? rows
              .map(
                  (b) => `
            <div class="booking-list-row" data-id="${b.id}">
                <span class="blr-name">${escapeHtml(b.name)}</span>
                <span class="blr-guests">${b.guests} guest${b.guests === 1 ? "" : "s"}</span>
                <span class="blr-when">${formatTime(b.booking_time)}</span>
                <span class="status-badge status-${b.status}">${b.status}</span>
            </div>`
              )
              .join("")
        : `<p class="panel-empty">${contextualEmptyMessage()}</p>`;
}

els.bookingsListWrap.addEventListener("click", (e) => {
    const row = e.target.closest(".booking-list-row");
    if (row) openBookingModal(row.dataset.id);
});

els.viewToggle.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    document.querySelectorAll("#viewToggle .chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    state.bookingsViewMode = chip.dataset.view;
    localStorage.setItem("bb_admin_view_mode", state.bookingsViewMode);
    renderBookings();
});

// --- Date navigator + emergency block ---
function updateDateNav() {
    const fd = focusDate();
    const today = todayStr();
    const tomorrow = addDays(today, 1);

    els.dateNavLabel.textContent = fd === today ? "Today" : fd === tomorrow ? "Tomorrow" : formatDate(fd);
    els.emergencyBlockToggle.checked = state.blockedSlots.some((s) => s.block_date === fd && s.start_time === null);
}

function goToDate(newDate) {
    els.dateFilter.value = newDate;
    state.activeQuick = null;
    document.querySelectorAll("#quickFilters .chip").forEach((c) => c.classList.remove("active"));
    renderBookings();
}

els.datePrevBtn.addEventListener("click", () => goToDate(addDays(focusDate(), -1)));
els.dateNextBtn.addEventListener("click", () => goToDate(addDays(focusDate(), 1)));

els.emergencyBlockToggle.addEventListener("change", async () => {
    const fd = focusDate();
    const checkbox = els.emergencyBlockToggle;
    const wasChecked = checkbox.checked;
    checkbox.disabled = true;

    try {
        if (wasChecked) {
            await apiFetch("/api/admin/blocked-slots", {
                method: "POST",
                body: JSON.stringify({ date: fd, wholeDay: true, reason: "Emergency block" }),
            });
        } else {
            const existing = state.blockedSlots.find((s) => s.block_date === fd && s.start_time === null);
            if (existing) {
                await apiFetch(`/api/admin/blocked-slots/${existing.id}`, { method: "DELETE" });
            }
        }
        await loadBlockedSlots();
        renderBlockedSlots();
        updateDateNav();
    } catch (err) {
        checkbox.checked = !wasChecked;
        alert("Could not update the block for this day: " + err.message);
    } finally {
        checkbox.disabled = false;
    }
});

function renderBookingsTable() {
    const rows = getFilteredBookings();

    els.bookingsTableBody.innerHTML = rows.length
        ? rows
              .map(
                  (b) => `
            <tr data-id="${b.id}">
                <td data-label="Code">${b.booking_code}</td>
                <td data-label="Customer">${escapeHtml(b.name)}</td>
                <td data-label="Date">${formatDate(b.booking_date)}</td>
                <td data-label="Time">${formatTime(b.booking_time)}</td>
                <td data-label="Guests">${b.guests}</td>
                <td data-label="Visits"><span class="visit-badge ${b.customer_booking_count > 1 ? "repeat" : ""}">${b.customer_booking_count > 1 ? `Repeat ×${b.customer_booking_count}` : "New"}</span></td>
                <td data-label="Status"><span class="status-badge status-${b.status}">${b.status}</span></td>
                <td data-label="Actions"><div class="row-actions">${actionButtons(b)}</div></td>
            </tr>`
              )
              .join("")
        : `<tr><td colspan="8" class="panel-empty">${contextualEmptyMessage()}</td></tr>`;
}

function actionButtons(b) {
    if (b.status === "pending") {
        return `
            <button class="action-confirm" data-action="confirmed" data-id="${b.id}">Confirm</button>
            <button class="action-reject" data-action="rejected" data-id="${b.id}">Reject</button>`;
    }
    if (b.status === "confirmed") {
        return `<button class="action-cancel" data-action="cancelled" data-id="${b.id}">Cancel</button>`;
    }
    return `<button class="action-reopen" data-action="pending" data-id="${b.id}">Reopen</button>`;
}

document.addEventListener("click", (e) => {
    const actionBtn = e.target.closest("[data-action]");
    if (actionBtn) {
        e.stopPropagation();
        updateBookingStatus(actionBtn.dataset.id, actionBtn.dataset.action);
        return;
    }

    const row = e.target.closest("tr[data-id]");
    if (row) {
        openBookingModal(row.dataset.id);
    }
});

async function updateBookingStatus(id, status) {
    try {
        await apiFetch(`/api/admin/bookings/${id}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status }),
        });
        await loadBookings();
        renderOverview();
        renderBookings();
        renderCustomersTable();
        renderNotifications();
        renderNotifBadge();
    } catch (err) {
        alert("Could not update booking: " + err.message);
    }
}

function openBookingModal(id) {
    const b = state.bookings.find((x) => String(x.id) === String(id));
    if (!b) return;
    els.bookingModalContent.innerHTML = `
        <h2>${escapeHtml(b.name)}</h2>
        <div class="modal-row"><span>Booking Code</span><strong>${b.booking_code}</strong></div>
        <div class="modal-row"><span>Date</span><strong>${formatDate(b.booking_date)}</strong></div>
        <div class="modal-row"><span>Time</span><strong>${formatTime(b.booking_time)}</strong></div>
        <div class="modal-row"><span>Guests</span><strong>${b.guests}</strong></div>
        <div class="modal-row"><span>Status</span><span class="status-badge status-${b.status}">${b.status}</span></div>
        <div class="modal-row"><span>Customer Bookings</span><strong>${b.customer_booking_count}${b.customer_booking_count > 1 ? " (repeat customer)" : " (new customer)"}</strong></div>
        <div class="modal-row"><span>Email</span><strong>${escapeHtml(b.email)}</strong></div>
        <div class="modal-row"><span>Phone</span><strong>${escapeHtml(b.phone)}</strong></div>
        <div class="modal-row"><span>Marketing Emails</span><strong>${b.marketing_consent ? "Opted in" : "Not opted in"}</strong></div>
        <div class="modal-row"><span>Booked On</span><strong>${new Date(b.created_at).toLocaleString("en-GB")}</strong></div>
        ${b.notes ? `<div class="modal-row" style="display:block;"><span style="display:block; margin-bottom:6px;">Notes / Special Requests</span><strong style="font-weight:400;">${escapeHtml(b.notes)}</strong></div>` : ""}
        <div class="modal-close">
            <button class="icon-btn" id="editBookingBtn">Edit Booking</button>
            <button id="closeModalBtn">Close</button>
        </div>
    `;
    els.bookingModal.hidden = false;
    document.getElementById("closeModalBtn").addEventListener("click", () => {
        els.bookingModal.hidden = true;
    });
    document.getElementById("editBookingBtn").addEventListener("click", () => editBookingModal(id));
}

function editBookingModal(id) {
    const b = state.bookings.find((x) => String(x.id) === String(id));
    if (!b) return;
    els.bookingModalContent.innerHTML = `
        <h2>Edit Booking — ${escapeHtml(b.name)}</h2>
        <div class="field">
            <label for="editDate">Date</label>
            <input type="date" id="editDate" value="${b.booking_date}">
        </div>
        <div class="field">
            <label for="editTime">Time</label>
            <input type="time" id="editTime" value="${b.booking_time.slice(0, 5)}">
        </div>
        <div class="field">
            <label for="editGuests">Guests</label>
            <input type="number" min="1" max="50" id="editGuests" value="${b.guests}">
        </div>
        <div id="editError" class="admin-error" hidden></div>
        <div class="modal-close">
            <button class="btn btn-gold" id="saveEditBtn">Save Changes</button>
            <button id="cancelEditBtn">Cancel</button>
        </div>
    `;
    document.getElementById("cancelEditBtn").addEventListener("click", () => openBookingModal(id));
    document.getElementById("saveEditBtn").addEventListener("click", async () => {
        const date = document.getElementById("editDate").value;
        const time = document.getElementById("editTime").value;
        const guests = Number(document.getElementById("editGuests").value);
        const errorEl = document.getElementById("editError");

        try {
            await apiFetch(`/api/admin/bookings/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ date, time, guests }),
            });
            await loadBookings();
            renderOverview();
            renderBookings();
            renderCustomersTable();
            renderNotifications();
            els.bookingModal.hidden = true;
        } catch (err) {
            errorEl.textContent = err.message;
            errorEl.hidden = false;
        }
    });
}

els.bookingModal.addEventListener("click", (e) => {
    if (e.target === els.bookingModal) els.bookingModal.hidden = true;
});

// Quick filter chips
els.quickFilters.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;

    document.querySelectorAll("#quickFilters .chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    state.activeQuick = chip.dataset.quick;

    if (state.activeQuick === "today") {
        els.dateFilter.value = todayStr();
        els.statusFilter.value = "";
    } else if (state.activeQuick === "tomorrow") {
        els.dateFilter.value = addDays(todayStr(), 1);
        els.statusFilter.value = "";
    } else {
        els.dateFilter.value = "";
        els.statusFilter.value = "";
    }
    renderBookings();
});

[els.statusFilter, els.dateFilter, els.searchFilter].forEach((el) => {
    el.addEventListener("input", () => {
        state.activeQuick = null;
        document.querySelectorAll("#quickFilters .chip").forEach((c) => c.classList.remove("active"));
        renderBookings();
    });
});

// --- Settings ---
els.closedWeekdaysGroup.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const day = Number(chip.dataset.weekday);
    chip.classList.toggle("active");
    state.closedWeekdays = chip.classList.contains("active")
        ? [...new Set([...state.closedWeekdays, day])]
        : state.closedWeekdays.filter((d) => d !== day);
});

els.saveSettingsBtn.addEventListener("click", async () => {
    try {
        await apiFetch("/api/admin/settings", {
            method: "PATCH",
            body: JSON.stringify({
                autoAcceptBookings: els.autoAcceptToggle.checked,
                openingTime: els.openingTimeInput.value,
                closingTime: els.closingTimeInput.value,
                slotIntervalMinutes: Number(els.slotIntervalInput.value),
                minGuestsPerBooking: Number(els.minGuestsInput.value),
                maxGuestsPerBooking: Number(els.maxGuestsInput.value),
                maxCoversPerSlot: els.maxCoversInput.value === "" ? null : Number(els.maxCoversInput.value),
                minAdvanceNoticeMinutes: Number(els.minAdvanceNoticeInput.value),
                confirmationMessage: els.confirmationMessageInput.value,
                closedWeekdays: state.closedWeekdays,
            }),
        });
        els.saveStatus.classList.add("show");
        setTimeout(() => els.saveStatus.classList.remove("show"), 2000);
    } catch (err) {
        alert("Could not save settings: " + err.message);
    }
});

els.saveReminderSettingsBtn.addEventListener("click", async () => {
    try {
        await apiFetch("/api/admin/settings", {
            method: "PATCH",
            body: JSON.stringify({
                reminderEnabled: els.reminderEnabledToggle.checked,
                reminderHoursBefore: Number(els.reminderHoursInput.value),
                feedbackEnabled: els.feedbackEnabledToggle.checked,
                feedbackHoursAfter: Number(els.feedbackHoursInput.value),
                feedbackLink: els.feedbackLinkInput.value,
            }),
        });
        els.reminderSaveStatus.classList.add("show");
        setTimeout(() => els.reminderSaveStatus.classList.remove("show"), 2000);
    } catch (err) {
        alert("Could not save reminder settings: " + err.message);
    }
});

// --- Blocked slots ---
els.blockWholeDayInput.addEventListener("change", () => {
    const wholeDay = els.blockWholeDayInput.checked;
    els.blockStartInput.disabled = wholeDay;
    els.blockEndInput.disabled = wholeDay;
    if (wholeDay) {
        els.blockStartInput.value = "";
        els.blockEndInput.value = "";
    }
});

els.addBlockedSlotBtn.addEventListener("click", async () => {
    const date = els.blockDateInput.value;
    const wholeDay = els.blockWholeDayInput.checked;
    const startTime = els.blockStartInput.value;
    const endTime = els.blockEndInput.value;
    const reason = els.blockReasonInput.value;

    if (!date || (!wholeDay && (!startTime || !endTime))) {
        alert("Please choose a date, and either check \"Whole day\" or set a start/end time.");
        return;
    }

    try {
        await apiFetch("/api/admin/blocked-slots", {
            method: "POST",
            body: JSON.stringify({ date, wholeDay, startTime, endTime, reason }),
        });
        els.blockDateInput.value = "";
        els.blockWholeDayInput.checked = false;
        els.blockStartInput.disabled = false;
        els.blockEndInput.disabled = false;
        els.blockStartInput.value = "";
        els.blockEndInput.value = "";
        els.blockReasonInput.value = "";
        await loadBlockedSlots();
        renderBlockedSlots();
        updateDateNav();
    } catch (err) {
        alert("Could not block slot: " + err.message);
    }
});

function renderBlockedSlots() {
    els.blockedSlotsList.innerHTML = state.blockedSlots.length
        ? state.blockedSlots
              .map(
                  (s) => `
            <div class="blocked-slot-item" data-id="${s.id}">
                <div>
                    <div class="who">${formatDate(s.block_date)}, ${s.start_time ? `${formatTime(s.start_time)} – ${formatTime(s.end_time)}` : "All day"}</div>
                    ${s.reason ? `<div class="when">${escapeHtml(s.reason)}</div>` : ""}
                </div>
                <button class="action-reject" data-remove-block="${s.id}">Remove</button>
            </div>`
              )
              .join("")
        : `<p class="panel-empty">No blocked slots.</p>`;
}

els.blockedSlotsList.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-remove-block]");
    if (!btn) return;
    try {
        await apiFetch(`/api/admin/blocked-slots/${btn.dataset.removeBlock}`, { method: "DELETE" });
        await loadBlockedSlots();
        renderBlockedSlots();
        updateDateNav();
    } catch (err) {
        alert("Could not remove blocked slot: " + err.message);
    }
});

// --- Vouchers ---
function voucherStatus(v) {
    if (!v.active) return "inactive";
    const today = todayStr();
    if (v.expires_at && v.expires_at < today) return "expired";
    if (v.max_redemptions !== null && v.times_redeemed >= v.max_redemptions) return "full";
    return "active";
}

function voucherLabel(v) {
    const value = Number(v.discount_value);
    return v.discount_type === "percentage" ? `${value}% off` : `£${value} off`;
}

function renderVouchersTable() {
    els.vouchersTableBody.innerHTML = state.vouchers.length
        ? state.vouchers
              .map((v) => {
                  const status = voucherStatus(v);
                  const canRedeem = status === "active";
                  return `
            <tr data-voucher-id="${v.id}">
                <td data-label="Code"><strong>${v.code}</strong></td>
                <td data-label="Description">${escapeHtml(v.description)}</td>
                <td data-label="Discount">${voucherLabel(v)}</td>
                <td data-label="Redemptions">${v.times_redeemed}${v.max_redemptions !== null ? ` / ${v.max_redemptions}` : " (unlimited)"}</td>
                <td data-label="Expires">${v.expires_at ? formatDate(v.expires_at) : "Never"}</td>
                <td data-label="Status"><span class="status-badge status-${status}">${status}</span></td>
                <td data-label="Actions"><div class="row-actions">
                    ${canRedeem ? `<button class="action-confirm" data-voucher-action="redeem" data-id="${v.id}">Redeem</button>` : ""}
                    <button class="action-reopen" data-voucher-action="toggle" data-id="${v.id}">${v.active ? "Deactivate" : "Activate"}</button>
                    <button class="action-reject" data-voucher-action="delete" data-id="${v.id}">Delete</button>
                </div></td>
            </tr>`;
              })
              .join("")
        : `<tr><td colspan="7" class="panel-empty">No vouchers yet.</td></tr>`;
}

els.vouchersTableBody.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-voucher-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.voucherAction;

    try {
        if (action === "redeem") {
            await apiFetch(`/api/admin/vouchers/${id}/redeem`, { method: "POST" });
        } else if (action === "toggle") {
            const voucher = state.vouchers.find((v) => String(v.id) === id);
            await apiFetch(`/api/admin/vouchers/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ active: !voucher.active }),
            });
        } else if (action === "delete") {
            if (!confirm("Delete this voucher? This can't be undone.")) return;
            await apiFetch(`/api/admin/vouchers/${id}`, { method: "DELETE" });
        }
        await loadVouchers();
        renderVouchersTable();
        renderVoucherSendOptions();
    } catch (err) {
        alert("Could not update voucher: " + err.message);
    }
});

els.generateVoucherCodeBtn.addEventListener("click", () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
    els.voucherCodeInput.value = code;
});

els.createVoucherBtn.addEventListener("click", async () => {
    const maxRedemptions = els.voucherMaxInput.value ? Number(els.voucherMaxInput.value) : null;
    try {
        await apiFetch("/api/admin/vouchers", {
            method: "POST",
            body: JSON.stringify({
                code: els.voucherCodeInput.value,
                description: els.voucherDescriptionInput.value,
                discountType: els.voucherTypeInput.value,
                discountValue: Number(els.voucherValueInput.value),
                maxRedemptions,
                expiresAt: els.voucherExpiryInput.value || null,
            }),
        });
        els.voucherCodeInput.value = "";
        els.voucherDescriptionInput.value = "";
        els.voucherValueInput.value = "";
        els.voucherMaxInput.value = "";
        els.voucherExpiryInput.value = "";
        els.voucherFormError.hidden = true;
        await loadVouchers();
        renderVouchersTable();
        renderVoucherSendOptions();
    } catch (err) {
        els.voucherFormError.textContent = err.message;
        els.voucherFormError.hidden = false;
    }
});

function renderVoucherSendOptions() {
    const active = state.vouchers.filter((v) => voucherStatus(v) === "active");
    els.sendVoucherSelect.innerHTML = active.length
        ? active.map((v) => `<option value="${v.id}">${v.code} — ${voucherLabel(v)}</option>`).join("")
        : `<option value="">No active vouchers</option>`;
}

function renderVoucherRecipients() {
    // Only customers who've actually opted in to marketing emails can be picked —
    // the backend enforces this too, but there's no point listing people we can't email.
    const customers = deriveCustomers().filter((c) => c.marketingConsent).sort((a, b) => b.count - a.count);
    els.voucherRecipientsList.innerHTML = customers.length
        ? customers
              .map(
                  (c) => `
            <div class="recipient-row">
                <label>
                    <input type="checkbox" data-recipient-id="${c.id}" ${state.selectedCustomerIds.has(c.id) ? "checked" : ""}>
                    ${escapeHtml(c.name)} — ${escapeHtml(c.email)} ${c.count > 1 ? `<span class="visit-badge repeat">×${c.count}</span>` : ""}
                </label>
            </div>`
              )
              .join("")
        : `<p class="panel-empty">No customers have opted in to marketing emails yet.</p>`;
}

els.voucherRecipientsList.addEventListener("change", (e) => {
    const checkbox = e.target.closest("[data-recipient-id]");
    if (!checkbox) return;
    const id = Number(checkbox.dataset.recipientId);
    if (checkbox.checked) state.selectedCustomerIds.add(id);
    else state.selectedCustomerIds.delete(id);
});

els.selectRepeatCustomersBtn.addEventListener("click", () => {
    state.selectedCustomerIds = new Set(deriveCustomers().filter((c) => c.count > 1 && c.marketingConsent).map((c) => c.id));
    renderVoucherRecipients();
});

els.selectAllCustomersBtn.addEventListener("click", () => {
    state.selectedCustomerIds = new Set(deriveCustomers().filter((c) => c.marketingConsent).map((c) => c.id));
    renderVoucherRecipients();
});

els.clearCustomerSelectionBtn.addEventListener("click", () => {
    state.selectedCustomerIds.clear();
    renderVoucherRecipients();
});

els.sendVoucherBtn.addEventListener("click", async () => {
    const voucherId = els.sendVoucherSelect.value;
    if (!voucherId) {
        alert("Create an active voucher first.");
        return;
    }
    if (state.selectedCustomerIds.size === 0) {
        alert("Select at least one customer to send to.");
        return;
    }

    try {
        const result = await apiFetch(`/api/admin/vouchers/${voucherId}/send`, {
            method: "POST",
            body: JSON.stringify({ customerIds: [...state.selectedCustomerIds] }),
        });
        els.voucherSendStatus.textContent = result.skippedCount > 0
            ? `Sent to ${result.sentCount}, skipped ${result.skippedCount} (no marketing consent) ✓`
            : "Sent ✓";
        els.voucherSendStatus.classList.add("show");
        setTimeout(() => els.voucherSendStatus.classList.remove("show"), 4000);
        await loadVouchers();
        await loadEmailLog();
        renderEmailLog();
    } catch (err) {
        alert("Could not send voucher: " + err.message);
    }
});

// --- Notifications ---
function getNewPendingBookings() {
    const lastSeen = Number(localStorage.getItem(NOTIF_SEEN_KEY) || 0);
    return state.bookings.filter((b) => b.status === "pending" && new Date(b.created_at).getTime() > lastSeen);
}

function renderNotifBadge() {
    const count = getNewPendingBookings().length;
    if (count > 0) {
        els.notifBadge.hidden = false;
        els.notifBadge.textContent = count;
    } else {
        els.notifBadge.hidden = true;
    }
}

function renderNotifications() {
    const lastSeen = Number(localStorage.getItem(NOTIF_SEEN_KEY) || 0);
    const pending = state.bookings
        .filter((b) => b.status === "pending")
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    els.notificationsList.innerHTML = pending.length
        ? pending
              .map((b) => {
                  const isNew = new Date(b.created_at).getTime() > lastSeen;
                  return `
            <div class="notification-item ${isNew ? "is-new" : ""}">
                <div class="notification-text">
                    <strong>New booking request</strong> — ${escapeHtml(b.name)}, ${b.guests} guests
                    <span class="meta">${formatDate(b.booking_date)} at ${formatTime(b.booking_time)} · requested ${new Date(b.created_at).toLocaleString("en-GB")}</span>
                </div>
                <div class="row-actions">
                    <button class="action-confirm" data-action="confirmed" data-id="${b.id}">Confirm</button>
                    <button class="action-reject" data-action="rejected" data-id="${b.id}">Reject</button>
                </div>
            </div>`;
              })
              .join("")
        : `<p class="panel-empty">No pending bookings need review right now.</p>`;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
}

// --- Init ---
document.querySelectorAll("#viewToggle .chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.view === state.bookingsViewMode);
});

if (state.adminKey) {
    showApp();
    loadEverything().catch(() => {});
} else {
    showLogin();
}
