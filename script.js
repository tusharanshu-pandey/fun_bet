// --- SUPABASE SETUP ---
const SUPABASE_URL = 'https://pqcijavplnmuwqcdprkc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxY2lqYXZwbG5tdXdxY2RwcmtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2MDgyMTcsImV4cCI6MjA3NTE4NDIxN30.MlsXtlTpmjVLzLDN8xHKJ6AqXrkrjUPpJ97sCnty504';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- DOM ELEMENTS ---
const loginView = document.getElementById('login-view');
const appView = document.getElementById('app-view');
const nameInput = document.getElementById('name');
const passwordInput = document.getElementById('password');
const signinBtn = document.getElementById('signin-btn');
const loginError = document.getElementById('login-error');
const playerNameDisplay = document.getElementById('player-name');
const playerPointsDisplay = document.getElementById('player-points');
const logoutBtn = document.getElementById('logout-btn');
const questionText = document.getElementById('question-text');
const optionsContainer = document.getElementById('options-container');
const betAmountInput = document.getElementById('bet-amount');
const placeBetBtn = document.getElementById('place-bet-btn');
const betError = document.getElementById('bet-error');
const historyList = document.getElementById('history-list');
const leaderboardList = document.getElementById('leaderboard-list');

// --- APP STATE ---
let currentPlayer = null;
let activeQuestion = null;
let selectedOption = null;

// --- FUNCTIONS ---

// Function to handle both Login and Registration
async function handleSignIn() {
    const name = nameInput.value.trim();
    const password = passwordInput.value.trim();
    loginError.textContent = '';

    if (!name || !password) {
        loginError.textContent = 'Name and password cannot be empty.';
        return;
    }

    // 1. Check if player exists
    const { data: existingPlayer, error: fetchError } = await supabase
        .from('players')
        .select('*')
        .eq('name', name)
        .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 means no rows found, which is ok
        loginError.textContent = 'Error checking player data.';
        console.error('Fetch error:', fetchError);
        return;
    }

    if (existingPlayer) {
        // 2. Player exists, so check password (Login)
        if (existingPlayer.password === password) {
            currentPlayer = existingPlayer;
            localStorage.setItem('betting_app_player', JSON.stringify(currentPlayer));
            showAppView(currentPlayer);
        } else {
            loginError.textContent = 'Incorrect password.';
        }
    } else {
        // 3. Player does not exist, create a new one (Register)
        const { data: newPlayer, error: insertError } = await supabase
            .from('players')
            .insert({ name, password, points: 1000 })
            .select()
            .single();
        
        if (insertError) {
            loginError.textContent = 'Could not create account.';
            console.error('Insert error:', insertError);
        } else {
            currentPlayer = newPlayer;
            localStorage.setItem('betting_app_player', JSON.stringify(currentPlayer));
            showAppView(currentPlayer);
        }
    }
}

// Show main app view and hide login
function showAppView(user) {
    playerNameDisplay.textContent = user.name;
    playerPointsDisplay.textContent = user.points;
    loginView.classList.add('hidden');
    appView.classList.remove('hidden');

    fetchActiveQuestion();
    renderHistory();
    renderLeaderboard();

    // Set up real-time subscriptions
    subscribeToBets();
    subscribeToPlayers();
}

function handleLogout() {
    localStorage.removeItem('betting_app_player');
    currentPlayer = null;
    // Reloading the page is the simplest and cleanest way to reset the app's state
    location.reload();
}

// Fetch the current active question from the database
async function fetchActiveQuestion() {
    const { data, error } = await supabase
        .from('questions')
        .select('*')
        .eq('is_active', true)
        .single();
    
    if (error || !data) {
        questionText.textContent = 'No active question at the moment. Check back later!';
        optionsContainer.innerHTML = '';
        document.getElementById('betting-controls').classList.add('hidden');
    } else {
        activeQuestion = data;
        renderQuestion();
        renderHistory(); // Also render history when a question loads
    }
}

// Display the question and betting options with multiplier odds
async function renderQuestion() {
    questionText.textContent = activeQuestion.question_text;
    optionsContainer.innerHTML = ''; // Clear previous options
    document.getElementById('betting-controls').classList.remove('hidden');

    // Get all bets for the current question
    const { data: bets, error } = await supabase
        .from('bets')
        .select('option, amount')
        .eq('question_id', activeQuestion.id);

    if (error) {
        console.error("Couldn't fetch bets for odds calculation", error);
        return;
    }

    // Calculate the total points bet on each option
    const pointsPerOption = activeQuestion.options.reduce((acc, option) => {
        acc[option] = 0;
        return acc;
    }, {});
    
    let totalPot = 0;
    bets.forEach(bet => {
        if (pointsPerOption.hasOwnProperty(bet.option)) {
            pointsPerOption[bet.option] += bet.amount;
        }
        totalPot += bet.amount;
    });

    // Create and display option buttons
    activeQuestion.options.forEach(option => {
        const optionPoints = pointsPerOption[option];
        let multiplierText;

        if (totalPot === 0 || optionPoints === 0) {
            // If no bets on this option or no bets at all, multiplier is undefined
             multiplierText = '—x';
        } else {
            // Calculate payout multiplier: (Total Pot / Points on this option)
            const multiplier = totalPot / optionPoints;
            multiplierText = `${multiplier.toFixed(2)}x`;
        }
        
        const button = document.createElement('button');
        button.className = 'option-btn';
        button.innerHTML = `
            <div class="flex justify-between items-center">
                <span class="option-text">${option}</span>
                <span class="text-xl font-bold text-green-400">${multiplierText}</span>
            </div>
        `;
        button.onclick = () => selectOption(button, option);
        optionsContainer.appendChild(button);
    });
}


// Handle option selection
function selectOption(button, option) {
    document.querySelectorAll('.option-btn').forEach(btn => btn.classList.remove('selected'));
    button.classList.add('selected');
    selectedOption = option;
    placeBetBtn.disabled = false;
}

// Handle placing a bet
async function placeBet() {
    const amount = parseInt(betAmountInput.value);
    betError.textContent = '';

    if (!selectedOption) {
        betError.textContent = 'Please select an option first.';
        return;
    }
    if (isNaN(amount) || amount <= 0) {
        betError.textContent = 'Please enter a valid bet amount.';
        return;
    }
    if (amount > currentPlayer.points) {
        betError.textContent = "You don't have enough points.";
        return;
    }

    // 1. Deduct points from player
    const newPoints = currentPlayer.points - amount;
    const { error: updateError } = await supabase
        .from('players')
        .update({ points: newPoints })
        .eq('name', currentPlayer.name);

    if (updateError) {
        betError.textContent = 'Failed to update points.';
        console.error(updateError);
        return;
    }

    // 2. Record the bet in the 'bets' table
    const { error: insertError } = await supabase
        .from('bets')
        .insert({
            question_id: activeQuestion.id,
            player_name: currentPlayer.name,
            option: selectedOption,
            amount: amount
        });

    if (insertError) {
        betError.textContent = 'Failed to place bet.';
        // Attempt to refund points if bet placement fails
        await supabase.from('players').update({ points: currentPlayer.points }).eq('name', currentPlayer.name);
        console.error(insertError);
        return;
    }

    // 3. Update local state and UI
    currentPlayer.points = newPoints;
    localStorage.setItem('betting_app_player', JSON.stringify(currentPlayer));
    playerPointsDisplay.textContent = newPoints;
    betAmountInput.value = '';
    document.querySelectorAll('.option-btn').forEach(btn => btn.classList.remove('selected'));
    selectedOption = null;
    placeBetBtn.disabled = true;

    // Manually call renderHistory to instantly update the list for the current user.
    renderHistory();
}


// Fetch and display the current player's bet history for the active question
async function renderHistory() {
    if (!currentPlayer || !activeQuestion) {
        historyList.innerHTML = '<p class="text-gray-500 text-center">No active question to show history for.</p>';
        return;
    }

    const { data, error } = await supabase
        .from('bets')
        .select('*')
        .eq('player_name', currentPlayer.name)
        .eq('question_id', activeQuestion.id)
        .order('created_at', { ascending: false }); // Show newest bets first
    
    if (error) return;

    historyList.innerHTML = '';
    if (data.length === 0) {
        historyList.innerHTML = '<p class="text-gray-500 text-center">You have not placed any bets on this question.</p>';
    } else {
        data.forEach(bet => {
            const li = document.createElement('li');
            li.className = 'flex justify-between items-center text-sm p-3 bg-gray-900 rounded-lg';
            li.innerHTML = `
                <span>Bet on: <span class="font-semibold text-white">${bet.option}</span></span>
                <span class="font-bold text-lg">${bet.amount} pts</span>
            `;
            historyList.appendChild(li);
        });
    }
}

async function renderLeaderboard() {
    if (!leaderboardList) return;

    const { data: players, error } = await supabase
        .from('players')
        .select('*')
        .order('points', { ascending: false })
        .limit(10);

    if (error) {
        console.error('Error fetching leaderboard:', error);
        leaderboardList.innerHTML = '<li>Could not load leaderboard.</li>';
        return;
    }

    if (players.length === 0) {
        leaderboardList.innerHTML = '<li>No players yet.</li>';
        return;
    }

    leaderboardList.innerHTML = ''; // Clear existing list
    players.forEach((player, index) => {
        const rank = index + 1;
        const li = document.createElement('li');
        li.innerHTML = `
            <span class="leaderboard-rank">#${rank}</span>
            <span class="leaderboard-name">${player.name}</span>
            <span class="leaderboard-points">${player.points} pts</span>
        `;
        leaderboardList.appendChild(li);
});
}

// Set up a real-time subscription to the 'bets' table
function subscribeToBets() {
    supabase
        .channel('public:bets')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bets' }, payload => {
            if (activeQuestion && payload.new.question_id === activeQuestion.id) {
                // If the new bet is for the current question, re-render question for odds and history
                renderQuestion();
                renderHistory();
            }
        })
        .subscribe();
}

function subscribeToPlayers() {
    supabase
        .channel('public:players')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, payload => {
            // Check if the change affects the current player
            if (currentPlayer && payload.new.name === currentPlayer.name) {
                currentPlayer.points = payload.new.points;
                playerPointsDisplay.textContent = currentPlayer.points;
                localStorage.setItem('betting_app_player', JSON.stringify(currentPlayer));
            }
            renderLeaderboard();
        })
        .subscribe();
}

// --- EVENT LISTENERS & INITIALIZATION ---

// New function to get the latest player data from the DB
async function refreshPlayerData(playerName) {
    const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('name', playerName)
        .single();
    
    if (error || !data) {
        // If player is not found in DB (e.g., deleted), log them out.
        handleLogout();
    } else {
        // Update state and UI with fresh data
        currentPlayer = data;
        localStorage.setItem('betting_app_player', JSON.stringify(currentPlayer));
        showAppView(currentPlayer);
    }
}

// Check for a logged-in user on page load
document.addEventListener('DOMContentLoaded', () => {
    const savedPlayerJSON = localStorage.getItem('betting_app_player');
    if (savedPlayerJSON) {
        const savedPlayer = JSON.parse(savedPlayerJSON);
        // Don't just trust localStorage. Re-fetch the player's latest data to ensure it's fresh.
        refreshPlayerData(savedPlayer.name);
    }
});


signinBtn.addEventListener('click', handleSignIn);
placeBetBtn.addEventListener('click', placeBet);
logoutBtn.addEventListener('click', handleLogout);

