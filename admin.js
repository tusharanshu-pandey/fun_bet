// --- SUPABASE & AUTH SETUP ---
// This is your SECRET key. DO NOT expose this in a public client-side app.
// It's okay here because this is a local-only admin tool.
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxY2lqYXZwbG5tdXdxY2RwcmtjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTYwODIxNywiZXhwIjoyMDc1MTg0MjE3fQ.QOmvvhEMjBtVtdJtF9dZWRJ2f6-2BLd8lsShza9QMxs';
const SUPABASE_URL = 'https://pqcijavplnmuwqcdprkc.supabase.co';
const ADMIN_PASSWORD = '';
let supabase = null;

// --- DOM ELEMENTS ---
const loginView = document.getElementById('login-view');
const adminView = document.getElementById('admin-view');
const passwordInput = document.getElementById('admin-password');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('admin-login-error');
const logoutBtn = document.getElementById('logout-btn');

const createQuestionBtn = document.getElementById('create-question-btn');
const questionTextInput = document.getElementById('question-text');
const questionOptionsInput = document.getElementById('question-options');
const createError = document.getElementById('create-error');
const settleContainer = document.getElementById('settle-questions-container');

// --- FUNCTIONS ---

function handleLogin() {
    if (passwordInput.value === ADMIN_PASSWORD) {
        // Initialize Supabase with the powerful service key ONLY after successful login
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        loginView.classList.add('hidden');
        adminView.classList.remove('hidden');
        loadActiveQuestions();
    } else {
        loginError.textContent = 'Incorrect password.';
    }
}

function handleLogout() {
    supabase = null;
    adminView.classList.add('hidden');
    loginView.classList.remove('hidden');
    passwordInput.value = '';
    loginError.textContent = '';
}

async function handleCreateQuestion() {
    createError.textContent = '';
    const text = questionTextInput.value.trim();
    const options = questionOptionsInput.value.split(',').map(s => s.trim()).filter(Boolean);

    if (!text || options.length < 2) {
        createError.textContent = 'Question and at least two comma-separated options are required.';
        return;
    }

    const { error } = await supabase
        .from('questions')
        .insert({ question_text: text, options: options, is_active: true });

    if (error) {
        createError.textContent = 'Failed to create question.';
        console.error(error);
    } else {
        questionTextInput.value = '';
        questionOptionsInput.value = '';
        alert('Question created successfully!');
        loadActiveQuestions(); // Refresh the list
    }
}

async function loadActiveQuestions() {
    settleContainer.innerHTML = '<p class="loading-text">Loading active questions...</p>';
    
    const { data: questions, error } = await supabase
        .from('questions')
        .select('*')
        .eq('is_active', true)
        .order('created_at');

    if (error) {
        settleContainer.innerHTML = '<p>Error loading questions.</p>';
        return;
    }
    
    if (questions.length === 0) {
        settleContainer.innerHTML = '<p>No active questions to settle.</p>';
        return;
    }

    settleContainer.innerHTML = ''; // Clear loading text
    questions.forEach(q => {
        const item = document.createElement('div');
        item.className = 'settle-item';
        
        const optionsDropdown = q.options.map(opt => `<option value="${opt}">${opt}</option>`).join('');

        item.innerHTML = `
            <p>${q.question_text}</p>
            <div class="settle-controls">
                <select id="select-${q.id}">
                    ${optionsDropdown}
                </select>
                <button class="settle-btn" data-id="${q.id}">Settle</button>
            </div>
        `;
        settleContainer.appendChild(item);
    });
}


async function settleQuestion(questionId, correctAnswer) {
    if (!confirm(`Are you sure you want to settle this question with the answer: "${correctAnswer}"? This cannot be undone.`)) {
        return;
    }

    // 1. Get all bets for this question
    const { data: bets, error: betsError } = await supabase
        .from('bets')
        .select('*')
        .eq('question_id', questionId);

    if (betsError) {
        alert('Error fetching bets for this question.');
        return;
    }

    const winners = bets.filter(bet => bet.option === correctAnswer);
    const totalPot = bets.reduce((sum, bet) => sum + bet.amount, 0);
    const winningOptionPot = winners.reduce((sum, bet) => sum + bet.amount, 0);

    if (winningOptionPot > 0) {
        const multiplier = totalPot / winningOptionPot;
        
        // Use a transaction to pay all winners
        const updates = winners.map(winner => 
            supabase.rpc('add_points_to_player', { 
                player_name: winner.player_name, 
                points_to_add: Math.floor(winner.amount * multiplier)
            })
        );
        
        await Promise.all(updates);
    }

    // 2. Mark question as settled (is_active = false) and set the correct answer
    const { error: updateError } = await supabase
        .from('questions')
        .update({ is_active: false, correct_answer: correctAnswer })
        .eq('id', questionId);

    if (updateError) {
        alert('Error updating the question status.');
        return;
    }

    alert('Question settled and winners have been paid!');
    loadActiveQuestions(); // Refresh the list
}


// --- EVENT LISTENERS ---
loginBtn.addEventListener('click', handleLogin);
logoutBtn.addEventListener('click', handleLogout);
createQuestionBtn.addEventListener('click', handleCreateQuestion);

// Event delegation for dynamically created settle buttons
settleContainer.addEventListener('click', (event) => {
    if (event.target.classList.contains('settle-btn')) {
        const questionId = event.target.dataset.id;
        const selectElement = document.getElementById(`select-${questionId}`);
        const correctAnswer = selectElement.value;
        settleQuestion(questionId, correctAnswer);
    }
});

