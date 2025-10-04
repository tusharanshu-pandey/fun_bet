// --- CONFIGURATION ---
// IMPORTANT: Replace the placeholder text inside the quotes with your real Supabase credentials.
// The values MUST be strings, meaning they MUST stay inside the single quotes ('').

// 1. Go to your Supabase project settings > API.
// 2. Find the Project URL and paste it inside the quotes below.
const SUPABASE_URL = 'https://pqcijavplnmuwqcdprkc.supabase.co'; // e.g., 'https://xyz.supabase.co'

// 3. Find the "anon" "public" key and paste it inside the quotes below.
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxY2lqYXZwbG5tdXdxY2RwcmtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2MDgyMTcsImV4cCI6MjA3NTE4NDIxN30.MlsXtlTpmjVLzLDN8xHKJ6AqXrkrjUPpJ97sCnty504'; // e.g., 'ey...'

// --- INITIALIZATION ---
let supabase = null;
try {
    console.log("Script started. Initializing Supabase client...");
    // FIX: Use 'window.supabase' to refer to the global library, preventing a name conflict.
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log("Supabase client initialized successfully.");
} catch (error) {
    console.error("CRITICAL ERROR: Failed to initialize Supabase. Check your URL and Key.");
    console.error("Error details:", error.message);
    alert("Error: Could not connect to the database. Please check the console (Right-click -> Inspect -> Console) for details.");
}


// --- DOM ELEMENTS ---
// Login Section
const loginSection = document.getElementById('login-section');
const nameInput = document.getElementById('name-input');
const startBtn = document.getElementById('start-btn');

// App Section
const appSection = document.getElementById('app-section');
const playerNameSpan = document.getElementById('player-name');
const playerPointsSpan = document.getElementById('player-points');
const logoutBtn = document.getElementById('logout-btn');

// Question Card
const questionText = document.getElementById('question-text');
const optionsContainer = document.getElementById('options-container');
const betAmountInput = document.getElementById('bet-amount');
const placeBetBtn = document.getElementById('place-bet-btn');
const messageArea = document.getElementById('message-area');

// History Section
const historyList = document.getElementById('history-list');

// --- APPLICATION STATE ---
let currentPlayer = null;
let currentQuestion = null;
let allBets = [];
let selectedOption = null;
const INITIAL_POINTS = 1000;

// --- UI UPDATE FUNCTIONS ---

/**
 * Toggles visibility between the login screen and the main app.
 * @param {boolean} showApp - If true, shows the app; otherwise, shows the login screen.
 */
function toggleAppView(showApp) {
    if (!loginSection || !appSection) return;
    loginSection.classList.toggle('hidden', showApp);
    appSection.classList.toggle('hidden', !showApp);
}

/**
 * Updates the player's name and points in the header.
 */
function updatePlayerInfo() {
    if (currentPlayer && playerNameSpan && playerPointsSpan) {
        playerNameSpan.textContent = currentPlayer.name;
        playerPointsSpan.textContent = currentPlayer.points;
    }
}

/**
 * Renders the question and calculates/displays the betting options and odds.
 */
function renderQuestionAndOptions() {
    if (!currentQuestion) {
        questionText.textContent = 'No active question at the moment. Please check back later!';
        optionsContainer.innerHTML = '';
        return;
    }

    questionText.textContent = currentQuestion.question_text;
    optionsContainer.innerHTML = ''; // Clear previous options

    // Calculate total points bet on each option
    const pointsPerOption = currentQuestion.options.reduce((acc, option) => {
        acc[option] = 0;
        return acc;
    }, {});

    let totalPot = 0;
    allBets.forEach(bet => {
        if (bet.question_id === currentQuestion.id && pointsPerOption.hasOwnProperty(bet.option)) {
            pointsPerOption[bet.option] += bet.amount;
            totalPot += bet.amount;
        }
    });

    // Create and append option buttons
    currentQuestion.options.forEach(optionText => {
        const pointsOnThisOption = pointsPerOption[optionText];
        const odds = totalPot > 0 && pointsOnThisOption > 0 ? (totalPot / pointsOnThisOption).toFixed(2) : '—';
        const percentage = totalPot > 0 ? (pointsOnThisOption / totalPot) * 100 : 0;

        const button = document.createElement('button');
        button.className = 'option-btn';
        button.dataset.option = optionText;
        button.innerHTML = `
            <div class="flex justify-between items-center w-full">
                <span class="option-text">${optionText}</span>
                <span class="option-odds font-semibold bg-gray-700 px-2 py-1 rounded-md text-sm">${odds}x</span>
            </div>
            <div class="progress-bar-bg">
                <div class="progress-bar" style="width: ${percentage}%;"></div>
            </div>
        `;
        button.onclick = () => handleOptionSelect(button, optionText);
        optionsContainer.appendChild(button);
    });
    
    // Reselect option if it was previously selected
    if (selectedOption) {
        const btn = optionsContainer.querySelector(`[data-option="${selectedOption}"]`);
        if(btn) btn.classList.add('selected');
    }
}

/**
 * Renders the player's betting history.
 */
async function renderHistory() {
    if (!currentPlayer || !supabase) return;

    const { data: userBets, error } = await supabase
        .from('bets')
        .select('*')
        .eq('player_name', currentPlayer.name)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching history:', error);
        return;
    }

    if (userBets.length === 0) {
        historyList.innerHTML = '<p class="text-gray-400 text-center">No bets placed yet.</p>';
        return;
    }

    historyList.innerHTML = userBets.map(bet => `
        <div class="text-sm flex justify-between">
            <span>Bet ${bet.amount} on "${bet.option}"</span>
            <span class="text-gray-400">${new Date(bet.created_at).toLocaleTimeString()}</span>
        </div>
    `).join('');
}

/**
 * Displays a temporary message to the user.
 * @param {string} text - The message to display.
 * @param {boolean} isError - If true, displays the message in red.
 */
function showMessage(text, isError = false) {
    messageArea.textContent = text;
    messageArea.style.color = isError ? '#f87171' : '#38bdf8'; // red-400 or sky-400
    setTimeout(() => messageArea.textContent = '', 3000);
}


// --- DATA FETCHING & BACKEND ---

/**
 * Fetches the most recent active question from the database.
 */
async function fetchActiveQuestion() {
    if (!supabase) return;
    const { data, error } = await supabase
        .from('questions')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
    
    if (error) {
        console.error('Error fetching question:', error.message);
        questionText.textContent = 'Could not load question.';
    } else {
        currentQuestion = data;
    }
}

/**
 * Fetches all bets for the current active question.
 */
async function fetchAllBets() {
     if (!currentQuestion || !supabase) return;
     const { data, error } = await supabase
        .from('bets')
        .select('*')
        .eq('question_id', currentQuestion.id);

    if (error) {
        console.error('Error fetching bets:', error);
    } else {
        allBets = data;
    }
}

/**
 * Listens for real-time changes to the 'bets' table.
 */
function subscribeToBetChanges() {
    if (!supabase) return;
    supabase
        .channel('public:bets')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bets' }, payload => {
            console.log('Bet change received!', payload);
            fetchAllBets().then(renderQuestionAndOptions);
        })
        .subscribe();
}

// --- EVENT HANDLERS ---

/**
 * Handles the login process.
 */
function handleLogin() {
    const name = nameInput.value.trim();
    if (name.length < 2) {
        alert('Please enter a name with at least 2 characters.');
        return;
    }

    currentPlayer = {
        name: name,
        points: INITIAL_POINTS
    };
    
    localStorage.setItem('betting-app-player', JSON.stringify(currentPlayer));

    initializeMainApp();
}

/**
 * Handles the logout process.
 */
function handleLogout() {
    localStorage.removeItem('betting-app-player');
    currentPlayer = null;
    toggleAppView(false);
    // You might want to reload the page or clear the app state more thoroughly
    window.location.reload();
}

/**
 * Handles the selection of a betting option.
 * @param {HTMLElement} selectedButton - The button element that was clicked.
 * @param {string} optionText - The text of the selected option.
 */
function handleOptionSelect(selectedButton, optionText) {
    document.querySelectorAll('.option-btn').forEach(btn => btn.classList.remove('selected'));
    selectedButton.classList.add('selected');
    selectedOption = optionText;
}

/**
 * Handles placing a new bet.
 */
async function handlePlaceBet() {
    if (!supabase) return showMessage('Database connection error.', true);
    const amount = parseInt(betAmountInput.value);

    // Validations
    if (!selectedOption) return showMessage('Please select an option first.', true);
    if (isNaN(amount) || amount <= 0) return showMessage('Please enter a valid bet amount.', true);
    if (amount > currentPlayer.points) return showMessage("You don't have enough points for that bet.", true);

    placeBetBtn.disabled = true;
    placeBetBtn.textContent = 'Placing...';

    currentPlayer.points -= amount;
    updatePlayerInfo();
    localStorage.setItem('betting-app-player', JSON.stringify(currentPlayer));

    const { error } = await supabase
        .from('bets')
        .insert({
            question_id: currentQuestion.id,
            player_name: currentPlayer.name,
            option: selectedOption,
            amount: amount
        });

    if (error) {
        showMessage('Failed to place bet. Try again.', true);
        currentPlayer.points += amount; // Revert points
        updatePlayerInfo();
        localStorage.setItem('betting-app-player', JSON.stringify(currentPlayer));
        console.error('Bet placement error:', error);
    } else {
        showMessage(`Bet of ${amount} placed on "${selectedOption}"!`);
        betAmountInput.value = '';
        renderHistory();
    }
    
    placeBetBtn.disabled = false;
    placeBetBtn.textContent = 'Place Bet';
}


// --- INITIALIZATION LOGIC ---

/**
 * Sets up the main application after login.
 */
async function initializeMainApp() {
    toggleAppView(true);
    updatePlayerInfo();
    await fetchActiveQuestion();
    await fetchAllBets();
    renderQuestionAndOptions();
    renderHistory();
    subscribeToBetChanges();
}

/**
 * Checks for a saved player in local storage on page load.
 */
function checkForSavedPlayer() {
    const savedPlayer = localStorage.getItem('betting-app-player');
    if (savedPlayer && supabase) {
        currentPlayer = JSON.parse(savedPlayer);
        initializeMainApp();
    } else {
        toggleAppView(false);
    }
}

// --- START THE APP ---
document.addEventListener('DOMContentLoaded', () => {
    // Only add listeners if the Supabase client was created
    if (supabase) {
        startBtn.addEventListener('click', handleLogin);
        logoutBtn.addEventListener('click', handleLogout);
        placeBetBtn.addEventListener('click', handlePlaceBet);
        
        nameInput.addEventListener('keyup', (event) => {
            if (event.key === 'Enter') handleLogin();
        });

        checkForSavedPlayer();
    }
});

