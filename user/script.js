// Supabase Configuration
const SUPABASE_URL = 'https://twwueihzjuobrcrlbzxf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_YCV9Ptu_o4BWq3xCXErVwg_jWx5Dh-6'; // Note: Ensure this is your 'anon' key for production security
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- AUTHENTICATION CHECK ---
let currentUser = null;

async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
}

// --- TAB SWITCHING LOGIC ---
window.switchTab = function (tabId) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('hidden');
    });

    // Show selected tab
    document.getElementById(tabId).classList.remove('hidden');

    // Update buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Find the button that was clicked
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => {
        if (btn.getAttribute('onclick').includes(tabId)) {
            btn.classList.add('active');
        }
    });
}

// Protect Route (Redirect to login if not authenticated)
if (!window.location.href.includes('login.html') && !window.location.href.includes('signup.html')) {
    checkSession().then(session => {
        if (!session) {
            window.location.href = 'login.html';
        } else {
            currentUser = session.user;
            document.getElementById('user-email').textContent = `Logged in as: ${currentUser.email}`;
            loadSecretCodes(); // Load codes once logged in
            loadRequests(); // Load requests once logged in
        }
    });
}

// Logout Logic
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        await supabase.auth.signOut();
        window.location.href = 'login.html';
    });
}

// Google Login Logic
const googleLoginBtn = document.getElementById('googleLoginBtn');
const googleSignupBtn = document.getElementById('googleSignupBtn');

async function signInWithGoogle() {
    const path = window.location.pathname;
    const directory = path.substring(0, path.lastIndexOf('/'));
    const redirectUrl = window.location.origin + directory + '/index.html';

    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: redirectUrl
        }
    });
    if (error) alert('Google Login Error: ' + error.message);
}

if (googleLoginBtn) googleLoginBtn.addEventListener('click', signInWithGoogle);
if (googleSignupBtn) googleSignupBtn.addEventListener('click', signInWithGoogle);

// --- SECRET CODE LOGIC ---
const latestCodeDisplay = document.getElementById('latest-code');
const codeHistoryList = document.getElementById('codeHistory');

let currentSessionCode = null; // Track code for current payment session

// Reusable function to generate code
async function generateSecretCode() {
    if (!currentUser) return;

    // Generate a random 7-digit code
    const newCode = Math.floor(1000000 + Math.random() * 9000000).toString();

    // Save to Supabase
    const { data, error } = await supabase
        .from('secret_codes')
        .insert([{ user_id: currentUser.id, code: newCode }])
        .select();

    if (error) {
        console.error('Error saving code:', error);
    } else {
        currentSessionCode = newCode;
        latestCodeDisplay.textContent = newCode;
        loadSecretCodes(); // Refresh history
    }
}

async function loadSecretCodes() {
    if (!currentUser) return;

    const { data, error } = await supabase
        .from('secret_codes')
        .select('*')
        .eq('user_id', currentUser.id) // Only my codes
        .order('created_at', { ascending: false });

    if (data && data.length > 0) {
        // Update Latest if we don't have a session code yet
        if (!currentSessionCode) {
            latestCodeDisplay.textContent = data[0].code;
        }

        // Update History
        codeHistoryList.innerHTML = '';
        data.forEach(item => {
            const li = document.createElement('li');
            li.className = 'history-item';
            li.innerHTML = `
                <span>Code: <strong>${item.code}</strong></span>
                <div>
                    <span style="color: #888; font-size: 0.8rem; margin-right: 10px;">${new Date(item.created_at).toLocaleDateString()}</span>
                    <button type="button" class="btn-sm" onclick="copyToClipboard('${item.code}')">Copy</button>
                </div>
            `;
            codeHistoryList.appendChild(li);
        });
    } else {
        latestCodeDisplay.textContent = "----";
        codeHistoryList.innerHTML = '<li style="padding:10px; text-align:center; color:#888;">No codes yet.</li>';
    }
}

window.copyToClipboard = function (text) {
    navigator.clipboard.writeText(text).then(() => {
        alert('Code copied to clipboard!');
    }).catch(err => {
        console.error('Failed to copy: ', err);
    });
};

// UPI Configuration
const MERCHANT_UPI = "9347547387@ybl";
const MERCHANT_NAME = "Canteen Pay";

// DOM Elements
const paymentForm = document.getElementById('paymentForm');
const amountInput = document.getElementById('amount');
const feeDisplay = document.getElementById('fee-display');
const requestsTableBody = document.querySelector('#requestsTable tbody');
const clearDataBtn = document.getElementById('clearData');
const qrcodeContainer = document.getElementById('qrcode');
const payBtn = document.getElementById('pay-btn');

// Initialize QR Code
let qrcode = new QRCode(qrcodeContainer, {
    width: 128,
    height: 128,
    colorDark: "#000000",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
});

// Fee Calculation Logic
function calculateFee(amount) {
    let fee = 0;
    amount = parseFloat(amount);
    if (isNaN(amount) || amount <= 0) return 0;

    if (amount >= 10 && amount <= 50) {
        fee = Math.floor(amount / 10);
    } else if (amount >= 51 && amount <= 100) {
        fee = 5;
    } else if (amount >= 101 && amount <= 250) {
        fee = 7;
    } else if (amount >= 251 && amount <= 500) {
        fee = 9;
    } else if (amount >= 501 && amount <= 1000) {
        fee = amount * 0.02;
    } else if (amount >= 1001 && amount <= 2000) {
        fee = amount * 0.015;
    } else if (amount > 2000) {
        fee = amount * 0.015;
    }
    return Math.round(fee * 100) / 100;
}

// Update QR and Link
function updatePaymentInfo(total) {
    if (total <= 0) {
        qrcodeContainer.style.display = 'none';
        payBtn.style.display = 'none';
        return;
    }

    const upiLink = `upi://pay?pa=${MERCHANT_UPI}&pn=${encodeURIComponent(MERCHANT_NAME)}&am=${total}&cu=INR`;

    qrcodeContainer.style.display = 'inline-block';
    qrcode.clear();
    qrcode.makeCode(upiLink);

    payBtn.style.display = 'inline-block';
    payBtn.href = upiLink;
}

// Event Listener: Update Fee Display & QR & Auto-Gen Code
amountInput.addEventListener('input', function () {
    const amount = parseFloat(this.value) || 0;
    const fee = calculateFee(amount);
    const total = amount + fee;

    feeDisplay.textContent = `Service Fee: ₹${fee} | Total You Pay: ₹${total}`;
    updatePaymentInfo(total);

    // Auto-generate code if valid amount and no code for this session yet
    if (amount > 0 && !currentSessionCode) {
        generateSecretCode();
    }
});

// Event Listener: Handle Form Submission
paymentForm.addEventListener('submit', async function (e) {
    e.preventDefault();

    try {
        const name = document.getElementById('studentName').value;
        const rollNo = document.getElementById('rollNumber').value;
        const amount = parseFloat(document.getElementById('amount').value);
        const upiId = "N/A"; // Removed input field, defaulting to N/A
        const note = document.getElementById('note').value;

        // Validation: Check for valid amount
        if (isNaN(amount) || amount <= 0) {
            alert("Please enter a valid positive amount.");
            return;
        }

        // Check for user session
        if (!currentUser) {
            alert("Session expired. Please login again.");
            window.location.href = 'login.html';
            return;
        }

        const fee = calculateFee(amount);
        const total = amount + fee;

        const requestData = {
            user_id: currentUser.id,
            student_name: name,
            roll_number: rollNo,
            amount: amount,
            fee: fee,
            total: total,
            upi_id: upiId,
            note: note,
            status: 'Pending'
        };

        const { data, error } = await supabase
            .from('requests')
            .insert([requestData])
            .select();

        if (error) {
            console.error('Error inserting data:', error);
            alert('Error submitting request: ' + error.message);
        } else {
            // Success UI
            paymentForm.reset();
            feeDisplay.textContent = `Service Fee: ₹0 | Total You Pay: ₹0`;
            document.getElementById('qrcode').style.display = 'none';
            document.getElementById('pay-btn').style.display = 'none';

            // Capture code before reset
            const secretCode = currentSessionCode || "N/A";

            // Reset session code
            currentSessionCode = null;
            latestCodeDisplay.textContent = "----";

            // Show Success Message / Token
            const successDiv = document.getElementById('success-message');
            successDiv.style.display = 'block';

            // Populate Token Details
            document.getElementById('token-total').textContent = `₹${total}`;
            document.getElementById('token-amount').textContent = `₹${amount}`;

            // Generate WhatsApp Link
            const transactionTime = new Date().toLocaleString();
            const waMessage = `*Cash Collection Request* 💵\n\nName: ${name}\nRoll No: ${rollNo}\n\n🔴 Paid via UPI: ₹${total}\n🟢 Collect Cash: ₹${amount}\n\nSecret Code: ${secretCode}\nTime: ${transactionTime}\n\nPlease verify and provide cash.`;
            const waLink = `https://api.whatsapp.com/send?phone=919347547387&text=${encodeURIComponent(waMessage)}`;
            document.getElementById('whatsapp-btn').href = waLink;

            // Simulate SMS Logs
            addSystemLog(`[${new Date().toLocaleTimeString()}] New Request Received from ${name}.`);
            addSystemLog(`[${new Date().toLocaleTimeString()}] 📨 Sending SMS to Admin (9347547387)... Success.`);
            addSystemLog(`[${new Date().toLocaleTimeString()}] 📨 Sending SMS to Staff (7330937706)... Success.`);
            addSystemLog(`[${new Date().toLocaleTimeString()}] 📨 Sending SMS to Staff (7989225548)... Success.`);

            loadRequests();

            // Keep success message visible so user can click WhatsApp button
            // setTimeout(() => {
            //     successDiv.style.display = 'none';
            // }, 10000);
        }
    } catch (err) {
        console.error("Unexpected error during submission:", err);
        alert("An unexpected error occurred: " + err.message);
    }
});

// System Log Function
function addSystemLog(message) {
    const logsDiv = document.getElementById('system-logs');
    const logEntry = document.createElement('div');
    logEntry.textContent = `> ${message}`;
    logsDiv.prepend(logEntry);
}

// Load from Supabase
async function loadRequests() {
    if (!currentUser) return;

    requestsTableBody.innerHTML = '<tr><td colspan="8">Loading...</td></tr>';

    const { data, error } = await supabase
        .from('requests')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching data:', error);
        requestsTableBody.innerHTML = '<tr><td colspan="8">Error loading data.</td></tr>';
    } else {
        requestsTableBody.innerHTML = '';
        if (data.length === 0) {
            requestsTableBody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No requests found.</td></tr>';
        }
        data.forEach(addRequestToTable);
    }
}

// Add Row to Table
function addRequestToTable(request) {
    const row = document.createElement('tr');
    const date = new Date(request.created_at).toLocaleString();

    row.innerHTML = `
        <td>${date}</td>
        <td>${request.student_name}</td>
        <td>${request.roll_number}</td>
        <td>₹${request.amount}</td>
        <td>₹${request.fee}</td>
        <td><strong>₹${request.total}</strong></td>
        <td>${request.upi_id}</td>
        <td><span style="color: ${request.status === 'Finish' ? 'green' : 'orange'}; font-weight: bold;">${request.status}</span></td>
    `;
    requestsTableBody.appendChild(row);
}

// Clear Data
clearDataBtn.textContent = "Refresh Data";
clearDataBtn.onclick = function () {
    loadRequests();
};

// Initialize
loadRequests();
