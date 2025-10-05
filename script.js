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
const questionsContainer = document.getElementById('questions-container');
const leaderboardList = document.getElementById('leaderboard-list');

// --- APP STATE ---
let currentPlayer = null;
let activeQuestions = []; // Now an array
let playerSelections = {}; // Tracks selected option for each question: { questionId: "Option A" }

// --- FUNCTIONS ---

async function handleSignIn() {
    const name = nameInput.value.trim();
    const password = passwordInput.value.trim();
    loginError.textContent = '';

    if (!name || !password) {
        loginError.textContent = 'Name and password cannot be empty.';
        return;
    }

    const { data: existingPlayer, error: fetchError } = await supabase
        .from('players')
        .select('*')
        .eq('name', name)
        .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
        loginError.textContent = 'Error checking player data.';
        return;
    }

    if (existingPlayer) {
        if (existingPlayer.password === password) {
            await refreshPlayerData(existingPlayer.name);
        } else {
            loginError.textContent = 'Incorrect password.';
        }
    } else {
        const { data: newPlayer, error: insertError } = await supabase
            .from('players')
            .insert({ name, password, points: 1000 })
            .select()
            .single();
        
        if (insertError) {
            loginError.textContent = 'Could not create account.';
        } else {
            await refreshPlayerData(newPlayer.name);
        }
    }
}

function showAppView(user) {
    playerNameDisplay.textContent = user.name;
    playerPointsDisplay.textContent = user.points;
    loginView.classList.add('hidden');
    appView.classList.remove('hidden');

    fetchActiveQuestions();
    renderLeaderboard();
    subscribeToBets();
    subscribeToPlayers();
}

function handleLogout() {
    localStorage.removeItem('betting_app_player');
    location.reload();
}

async function fetchActiveQuestions() {
    const { data, error } = await supabase
        .from('questions')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: true });
    
    if (error) {
        questionsContainer.innerHTML = '<p class="text-gray-400">Could not load questions.</p>';
        return;
    }
    
    activeQuestions = data;
    renderAllQuestions();
}

async function renderAllQuestions() {
    if (activeQuestions.length === 0) {
        questionsContainer.innerHTML = '<div class="card"><p class="text-center text-gray-400">No active questions at the moment. Check back later!</p></div>';
        return;
    }

    questionsContainer.innerHTML = ''; // Clear container
    for (const question of activeQuestions) {
        await renderSingleQuestion(question);
    }
}

async function renderSingleQuestion(question) {
    let questionCard = document.querySelector(`.question-card[data-question-id="${question.id}"]`);
    
    // If card doesn't exist, create it
    if (!questionCard) {
        questionCard = document.createElement('div');
        questionCard.className = 'card question-card';
        questionCard.setAttribute('data-question-id', question.id);
        questionsContainer.appendChild(questionCard);
    }

    const { data: bets } = await supabase
        .from('bets')
        .select('option, amount')
        .eq('question_id', question.id);

    const pointsPerOption = question.options.reduce((acc, option) => ({ ...acc, [option]: 0 }), {});
    let totalPot = 0;
    bets.forEach(bet => {
        if (pointsPerOption.hasOwnProperty(bet.option)) {
            pointsPerOption[bet.option] += bet.amount;
        }
        totalPot += bet.amount;
    });

    let optionsHTML = '';
    question.options.forEach(option => {
        const optionPoints = pointsPerOption[option];
        const multiplier = (totalPot === 0 || optionPoints === 0) ? '—' : (totalPot / optionPoints).toFixed(2);
        const isSelected = playerSelections[question.id] === option;
        optionsHTML += `
            <button class="option-btn ${isSelected ? 'selected' : ''}" data-option="${option}">
                <div class="flex justify-between items-center">
                    <span class="option-text">${option}</span>
                    <span class="text-xl font-bold text-green-400">${multiplier}x</span>
                </div>
            </button>`;
    });

    questionCard.innerHTML = `
        <h2 class="question-title">${question.question_text}</h2>
        <div class="options-container space-y-3">${optionsHTML}</div>
        <div class="betting-controls mt-6 flex gap-3">
            <input type="number" class="input-field bet-amount" placeholder="Bet amount">
            <button class="btn place-bet-btn" disabled>Place Bet</button>
        </div>
        <p class="bet-error text-red-500 mt-2 h-5"></p>
        <div class="history-section mt-6">
            <h3 class="text-lg font-semibold mb-3 border-b border-gray-700 pb-2">My Bets on this Question</h3>
            <ul class="history-list space-y-2"><li>Loading history...</li></ul>
        </div>
    `;

    await renderHistoryForQuestion(question.id);
}


async function handlePlaceBet(questionId) {
    const questionCard = document.querySelector(`.question-card[data-question-id="${questionId}"]`);
    const betAmountInput = questionCard.querySelector('.bet-amount');
    const betError = questionCard.querySelector('.bet-error');
    const amount = parseInt(betAmountInput.value);
    const selectedOption = playerSelections[questionId];
    
    betError.textContent = '';

    if (!selectedOption) {
        betError.textContent = 'Please select an option.'; return;
    }
    if (isNaN(amount) || amount <= 0) {
        betError.textContent = 'Invalid bet amount.'; return;
    }
    if (amount > currentPlayer.points) {
        betError.textContent = "You don't have enough points."; return;
    }

    const newPoints = currentPlayer.points - amount;
    const { error: updateError } = await supabase
        .from('players').update({ points: newPoints }).eq('name', currentPlayer.name);

    if (updateError) {
        betError.textContent = 'Failed to update points.'; return;
    }

    const { error: insertError } = await supabase
        .from('bets').insert({ question_id: questionId, player_name: currentPlayer.name, option: selectedOption, amount });

    if (insertError) {
        betError.textContent = 'Failed to place bet.';
        await supabase.from('players').update({ points: currentPlayer.points }).eq('name', currentPlayer.name);
        return;
    }

    currentPlayer.points = newPoints;
    localStorage.setItem('betting_app_player', JSON.stringify(currentPlayer));
    playerPointsDisplay.textContent = newPoints;
    betAmountInput.value = '';
    delete playerSelections[questionId]; // Reset selection
    
    // Re-render to update odds and UI state
    const question = activeQuestions.find(q => q.id === questionId);
    if (question) await renderSingleQuestion(question);
}

async function renderHistoryForQuestion(questionId) {
    const questionCard = document.querySelector(`.question-card[data-question-id="${questionId}"]`);
    const historyList = questionCard.querySelector('.history-list');

    const { data, error } = await supabase
        .from('bets').select('*').eq('player_name', currentPlayer.name).eq('question_id', questionId).order('created_at', { ascending: false });
    
    if (error) { historyList.innerHTML = '<li>Error loading history.</li>'; return; }

    if (data.length === 0) {
        historyList.innerHTML = '<li class="text-gray-500">You have not placed any bets on this question.</li>';
    } else {
        historyList.innerHTML = data.map(bet => `
            <li class="flex justify-between items-center text-sm p-3 bg-gray-900 rounded-lg">
                <span>Bet on: <span class="font-semibold text-white">${bet.option}</span></span>
                <span class="font-bold text-lg">${bet.amount} pts</span>
            </li>`).join('');
    }
}

async function renderLeaderboard() {
    const { data: players, error } = await supabase
        .from('players').select('*').order('points', { ascending: false }).limit(10);

    if (error) { leaderboardList.innerHTML = '<li>Could not load leaderboard.</li>'; return; }
    if (players.length === 0) { leaderboardList.innerHTML = '<li>No players yet.</li>'; return; }

    leaderboardList.innerHTML = players.map((player, index) => `
        <li>
            <span class="leaderboard-rank">#${index + 1}</span>
            <span class="leaderboard-name">${player.name}</span>
            <span class="leaderboard-points">${player.points} pts</span>
        </li>`).join('');
}

// --- SUBSCRIPTIONS ---
function subscribeToBets() {
    supabase.channel('public:bets')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bets' }, async payload => {
            const questionId = payload.new.question_id;
            const question = activeQuestions.find(q => q.id === questionId);
            if (question) {
                // Re-render the specific question card to update odds
                await renderSingleQuestion(question);
            }
        }).subscribe();
}

function subscribeToPlayers() {
    supabase.channel('public:players')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, payload => {
            if (currentPlayer && payload.new.name === currentPlayer.name) {
                currentPlayer.points = payload.new.points;
                playerPointsDisplay.textContent = currentPlayer.points;
                localStorage.setItem('betting_app_player', JSON.stringify(currentPlayer));
            }
            renderLeaderboard();
        }).subscribe();
}

// --- EVENT LISTENERS & INITIALIZATION ---
async function refreshPlayerData(playerName) {
    const { data, error } = await supabase
        .from('players').select('*').eq('name', playerName).single();
    if (error || !data) { handleLogout(); } 
    else {
        currentPlayer = data;
        localStorage.setItem('betting_app_player', JSON.stringify(currentPlayer));
        showAppView(currentPlayer);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const savedPlayer = JSON.parse(localStorage.getItem('betting_app_player'));
    if (savedPlayer) {
        refreshPlayerData(savedPlayer.name);
    } else {
        loginView.classList.remove('hidden');
    }
});

// Event Delegation for dynamic elements
questionsContainer.addEventListener('click', event => {
    const optionBtn = event.target.closest('.option-btn');
    const placeBetBtn = event.target.closest('.place-bet-btn');
    
    if (optionBtn) {
        const questionCard = optionBtn.closest('.question-card');
        const questionId = parseInt(questionCard.dataset.questionId);
        const option = optionBtn.dataset.option;

        // Update selection state
        playerSelections[questionId] = option;
        
        // Update UI for this card only
        questionCard.querySelectorAll('.option-btn').forEach(btn => btn.classList.remove('selected'));
        optionBtn.classList.add('selected');
        questionCard.querySelector('.place-bet-btn').disabled = false;
    }

    if (placeBetBtn) {
        const questionId = parseInt(placeBetBtn.closest('.question-card').dataset.questionId);
        handlePlaceBet(questionId);
    }
});

signinBtn.addEventListener('click', handleSignIn);
logoutBtn.addEventListener('click', handleLogout);

