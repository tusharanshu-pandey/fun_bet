// --- CONFIGURATION ---
const SUPABASE_URL = 'https://pqcijavplnmuwqcdprkc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxY2lqYXZwbG5tdXdxY2RwcmtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2MDgyMTcsImV4cCI6MjA3NTE4NDIxN30.MlsXtlTpmjVLzLDN8xHKJ6AqXrkrjUPpJ97sCnty504';

// --- INITIALIZATION ---
let supabase = null;
try {
    console.log("Script started. Initializing Supabase client...");
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log("Supabase client initialized successfully.");
} catch (error) {
    console.error("CRITICAL ERROR: Failed to initialize Supabase. Check your URL and Key.");
    console.error("Error details:", error.message);
}

// --- DOM ELEMENTS ---
const loginSection = document.getElementById('login-section');
const nameInput = document.getElementById('name-input');
const passwordInput = document.getElementById('password-input-user');
const loginBtn = document.getElementById('login-btn');
const registerBtn = document.getElementById('register-btn');
const loginMessageArea = document.getElementById('login-message-area');

const appSection = document.getElementById('app-section');
const playerNameSpan = document.getElementById('player-name');
const playerPointsSpan = document.getElementById('player-points');
const logoutBtn = document.getElementById('logout-btn');
const questionText = document.getElementById('question-text');
const optionsContainer = document.getElementById('options-container');
const betAmountInput = document.getElementById('bet-amount');
const placeBetBtn = document.getElementById('place-bet-btn');
const messageArea = document.getElementById('message-area');
const historyList = document.getElementById('history-list');

// --- APPLICATION STATE ---
let currentPlayer = null;
let currentQuestion = null;
let allBets = [];
let selectedOption = null;
const INITIAL_POINTS = 1000;

// --- UI FUNCTIONS ---
function toggleAppView(showApp) {
    loginSection.classList.toggle('hidden', showApp);
    appSection.classList.toggle('hidden', !showApp);
}

function updatePlayerInfo() {
    if (currentPlayer) {
        playerNameSpan.textContent = currentPlayer.name;
        playerPointsSpan.textContent = currentPlayer.points;
    }
}

function showMessage(text, isError = false, area = messageArea) {
    area.textContent = text;
    area.style.color = isError ? '#f87171' : '#38bdf8';
    setTimeout(() => area.textContent = '', 3000);
}

function renderQuestionAndOptions() {
    if (!currentQuestion) {
        questionText.textContent = 'No active question at the moment. Please check back later!';
        optionsContainer.innerHTML = '';
        placeBetBtn.disabled = true;
        betAmountInput.disabled = true;
        return;
    }
    if (currentQuestion.correct_answer) {
        placeBetBtn.disabled = true;
        betAmountInput.disabled = true;
        questionText.textContent = `(Closed) ${currentQuestion.question_text}`;
        optionsContainer.innerHTML = `<div class="text-center text-sky-400 font-bold">The winning answer was: ${currentQuestion.correct_answer}</div>`;
        return;
    }
    // ... (rest of the function is the same, no changes needed)
    placeBetBtn.disabled = false;
    betAmountInput.disabled = false;
    questionText.textContent = currentQuestion.question_text;
    optionsContainer.innerHTML = ''; 

    const pointsPerOption = currentQuestion.options.reduce((acc, option) => ({ ...acc, [option]: 0 }), {});
    let totalPot = 0;
    allBets.forEach(bet => {
        if (bet.question_id === currentQuestion.id && pointsPerOption.hasOwnProperty(bet.option)) {
            pointsPerOption[bet.option] += bet.amount;
            totalPot += bet.amount;
        }
    });

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
    
    if (selectedOption) {
        const btn = optionsContainer.querySelector(`[data-option="${selectedOption}"]`);
        if(btn) btn.classList.add('selected');
    }
}

async function renderHistory() {
    // ... (This function is the same, no changes needed)
    if (!currentPlayer || !supabase || !currentQuestion) return;

    const { data: userBets, error } = await supabase
        .from('bets')
        .select('*')
        .eq('player_name', currentPlayer.name)
        .eq('question_id', currentQuestion.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching history:', error);
        return;
    }

    if (userBets.length === 0) {
        historyList.innerHTML = '<p class="text-gray-400 text-center">No bets placed on this question yet.</p>';
        return;
    }

    historyList.innerHTML = userBets.map(bet => `
        <div class="text-sm flex justify-between">
            <span>Bet ${bet.amount} on "${bet.option}"</span>
            <span class="text-gray-400">${new Date(bet.created_at).toLocaleTimeString()}</span>
        </div>
    `).join('');
}


// --- DATA FETCHING & BACKEND ---
async function fetchActiveQuestion() {
    // ... (This function is the same, no changes needed)
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
    } else {
        currentQuestion = data;
    }
}

async function fetchAllBets() {
    // ... (This function is the same, no changes needed)
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

function subscribeToBetChanges() {
    // ... (This function is the same, no changes needed)
    if (!supabase) return;
    supabase
        .channel('public:bets')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bets' }, payload => {
            console.log('Bet change received!', payload);
            fetchAllBets().then(renderQuestionAndOptions);
        })
        .subscribe();
}

function subscribeToPlayerChanges() {
    // ... (This function is the same, no changes needed)
    if (!supabase || !currentPlayer) return;
    supabase
        .channel(`public:players:name=eq.${currentPlayer.name}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'players',
            filter: `name=eq.${currentPlayer.name}`
        }, payload => {
            console.log('Player points updated!', payload);
            currentPlayer.points = payload.new.points;
            updatePlayerInfo();
            showMessage('Your points have been updated!');
        })
        .subscribe();
}

// --- NEW AUTHENTICATION LOGIC ---

async function handleLogin() {
    const name = nameInput.value.trim();
    const password = passwordInput.value.trim();
    if (!name || !password) return showMessage('Name and password are required.', true, loginMessageArea);

    let { data: player, error } = await supabase
        .from('players')
        .select('*')
        .eq('name', name)
        .single();

    if (error || !player) {
        return showMessage('Player not found. Please register.', true, loginMessageArea);
    }

    if (player.password === password) {
        currentPlayer = player;
        localStorage.setItem('betting-app-player-name', currentPlayer.name);
        initializeMainApp();
    } else {
        return showMessage('Incorrect password.', true, loginMessageArea);
    }
}

async function handleRegister() {
    const name = nameInput.value.trim();
    const password = passwordInput.value.trim();
    if (name.length < 3 || password.length < 4) {
        return showMessage('Name must be 3+ chars, password 4+ chars.', true, loginMessageArea);
    }

    // Check if player name is already taken
    let { data: existingPlayer, error: selectError } = await supabase
        .from('players')
        .select('name')
        .eq('name', name)
        .single();

    if (existingPlayer) {
        return showMessage('This name is already taken.', true, loginMessageArea);
    }

    // Create new player
    const { data: newPlayer, error: insertError } = await supabase
        .from('players')
        .insert({ name, password, points: INITIAL_POINTS })
        .select()
        .single();

    if (insertError) {
        console.error("Registration error:", insertError);
        return showMessage('Could not create account.', true, loginMessageArea);
    }

    // Automatically log them in
    currentPlayer = newPlayer;
    localStorage.setItem('betting-app-player-name', currentPlayer.name);
    initializeMainApp();
}

function handleLogout() {
    localStorage.removeItem('betting-app-player-name');
    currentPlayer = null;
    window.location.reload();
}

// --- EVENT HANDLERS from original file ---
function handleOptionSelect(selectedButton, optionText) {
    if (currentQuestion.correct_answer) return;
    document.querySelectorAll('.option-btn').forEach(btn => btn.classList.remove('selected'));
    selectedButton.classList.add('selected');
    selectedOption = optionText;
}

async function handlePlaceBet() {
    // ... (This function is the same, no changes needed)
    if (!supabase) return showMessage('Database connection error.', true);
    const amount = parseInt(betAmountInput.value);

    if (!selectedOption) return showMessage('Please select an option first.', true);
    if (isNaN(amount) || amount <= 0) return showMessage('Please enter a valid bet amount.', true);
    if (amount > currentPlayer.points) return showMessage("You don't have enough points for that bet.", true);

    placeBetBtn.disabled = true;
    placeBetBtn.textContent = 'Placing...';
    
    const newPoints = currentPlayer.points - amount;
    const { error: updateError } = await supabase
        .from('players')
        .update({ points: newPoints })
        .eq('name', currentPlayer.name);

    if (updateError) {
        showMessage('Error updating points. Bet not placed.', true);
        placeBetBtn.disabled = false;
        placeBetBtn.textContent = 'Place Bet';
        return;
    }
    
    const { error: insertError } = await supabase
        .from('bets')
        .insert({
            question_id: currentQuestion.id,
            player_name: currentPlayer.name,
            option: selectedOption,
            amount: amount
        });

    if (insertError) {
        await supabase.from('players').update({ points: currentPlayer.points }).eq('name', currentPlayer.name);
        showMessage('Failed to place bet. Your points have been refunded.', true);
        console.error('Bet placement error:', insertError);
    } else {
        currentPlayer.points = newPoints;
        updatePlayerInfo();
        showMessage(`Bet of ${amount} placed on "${selectedOption}"!`);
        betAmountInput.value = '';
        renderHistory();
    }
    
    placeBetBtn.disabled = false;
    placeBetBtn.textContent = 'Place Bet';
}

// --- INITIALIZATION LOGIC ---
async function initializeMainApp() {
    toggleAppView(true);
    updatePlayerInfo();
    await fetchActiveQuestion();
    await fetchAllBets();
    renderQuestionAndOptions();
    renderHistory();
    subscribeToBetChanges();
    subscribeToPlayerChanges();
}

async function checkForSavedPlayer() {
    const savedPlayerName = localStorage.getItem('betting-app-player-name');
    if (savedPlayerName && supabase) {
        let { data: player } = await supabase
            .from('players')
            .select('*')
            .eq('name', savedPlayerName)
            .single();
        
        if (player) {
            currentPlayer = player;
            initializeMainApp();
        } else {
            // Player was deleted from DB, so clear local storage
            localStorage.removeItem('betting-app-player-name');
            toggleAppView(false);
        }
    } else {
        toggleAppView(false);
    }
}

// --- START THE APP ---
document.addEventListener('DOMContentLoaded', () => {
    if (supabase) {
        loginBtn.addEventListener('click', handleLogin);
        registerBtn.addEventListener('click', handleRegister);
        logoutBtn.addEventListener('click', handleLogout);
        placeBetBtn.addEventListener('click', handlePlaceBet);
        
        passwordInput.addEventListener('keyup', (event) => {
            if (event.key === 'Enter') handleLogin();
        });

        checkForSavedPlayer();
    }
});

