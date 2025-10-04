// --- CONFIGURATION ---
const SUPABASE_URL = 'https://pqcijavplnmuwqcdprkc.supabase.co';
const ADMIN_PASSWORD = 'fun@2025';

// !! IMPORTANT !! This is your secret key. Do not share this file publicly or upload it to GitHub.
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxY2lqYXZwbG5tdXdxY2RwcmtjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTYwODIxNywiZXhwIjoyMDc1MTg0MjE3fQ.QOmvvhEMjBtVtdJtF9dZWRJ2f6-2BLd8lsShza9QMxs'; 

// --- INITIALIZATION ---
let supabaseAdmin = null;

// --- DOM ELEMENTS ---
const passwordOverlay = document.getElementById('password-overlay');
const passwordInput = document.getElementById('password-input');
const passwordSubmit = document.getElementById('password-submit');
const adminContent = document.getElementById('admin-content');
const logoutBtnAdmin = document.getElementById('logout-btn-admin');
const adminMessage = document.getElementById('admin-message');

const newQuestionText = document.getElementById('new-question-text');
const newQuestionOptions = document.getElementById('new-question-options');
const createQuestionBtn = document.getElementById('create-question-btn');
const activeQuestionsContainer = document.getElementById('active-questions-container');

// --- ADMIN FUNCTIONS ---

function showAdminMessage(text, isError = false) {
    adminMessage.textContent = text;
    adminMessage.style.color = isError ? '#f87171' : '#6ee7b7'; // red-400 or emerald-300
    setTimeout(() => adminMessage.textContent = '', 4000);
}

async function fetchActiveQuestions() {
    const { data, error } = await supabaseAdmin
        .from('questions')
        .select('*')
        .eq('is_active', true)
        .is('correct_answer', null) // Only fetch questions that haven't been answered yet
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error fetching active questions:", error);
        activeQuestionsContainer.innerHTML = '<p class="text-red-400">Could not load questions.</p>';
        return;
    }

    if (data.length === 0) {
        activeQuestionsContainer.innerHTML = '<p class="text-gray-400">No active questions to settle.</p>';
        return;
    }

    renderActiveQuestions(data);
}

function renderActiveQuestions(questions) {
    activeQuestionsContainer.innerHTML = '';
    questions.forEach(q => {
        const questionEl = document.createElement('div');
        questionEl.className = 'bg-gray-700 p-4 rounded-lg';
        questionEl.innerHTML = `
            <p class="font-semibold mb-3">${q.question_text}</p>
            <div class="flex flex-wrap gap-2">
                ${q.options.map(option => `<button class="settle-option-btn" data-question-id="${q.id}" data-option="${option}">Declare "${option}" as Winner</button>`).join('')}
            </div>
        `;
        activeQuestionsContainer.appendChild(questionEl);
    });
}

async function handleCreateQuestion() {
    const questionText = newQuestionText.value.trim();
    const options = newQuestionOptions.value.split(',').map(s => s.trim()).filter(Boolean);

    if (!questionText || options.length < 2) {
        showAdminMessage('Please provide question text and at least 2 comma-separated options.', true);
        return;
    }

    // Deactivate all other questions first
    const { error: updateError } = await supabaseAdmin
        .from('questions')
        .update({ is_active: false })
        .eq('is_active', true);

    if (updateError) {
        showAdminMessage('Error deactivating old questions.', true);
        return;
    }

    // Insert the new question as the only active one
    const { error: insertError } = await supabaseAdmin
        .from('questions')
        .insert({
            question_text: questionText,
            options: options,
            is_active: true
        });
    
    if (insertError) {
        showAdminMessage('Failed to create new question.', true);
    } else {
        showAdminMessage('New question created and set as active!');
        newQuestionText.value = '';
        newQuestionOptions.value = '';
        fetchActiveQuestions();
    }
}

async function handleSetWinner(questionId, winningOption) {
    showAdminMessage('Processing payouts... This may take a moment.');
    
    // Step 1: Get all bets for this question
    const { data: bets, error: betsError } = await supabaseAdmin
        .from('bets')
        .select('*')
        .eq('question_id', questionId);
    
    if (betsError) return showAdminMessage('Could not fetch bets for this question.', true);

    const totalPot = bets.reduce((sum, bet) => sum + bet.amount, 0);
    const winners = bets.filter(bet => bet.option === winningOption);
    const winningPot = winners.reduce((sum, bet) => sum + bet.amount, 0);

    if (winningPot > 0) {
        const multiplier = totalPot / winningPot;

        // Step 2: Calculate payouts for each winner
        const payoutPromises = winners.map(async (winner) => {
            const payout = Math.floor(winner.amount * multiplier);
            
            // Using rpc to create an atomic transaction is safer
            const { error: payoutError } = await supabaseAdmin
                .rpc('add_points_to_player', {
                    player_name: winner.player_name,
                    points_to_add: payout
                });

            if (payoutError) {
                console.error(`Failed to pay ${winner.player_name}:`, payoutError);
            }
        });
        
        await Promise.all(payoutPromises);
    }
    
    // Step 3: Mark the question as answered
    const { error: updateError } = await supabaseAdmin
        .from('questions')
        .update({ correct_answer: winningOption, is_active: false })
        .eq('id', questionId);
    
    if (updateError) {
        showAdminMessage('Payouts complete, but failed to update question status.', true);
    } else {
        showAdminMessage(`Payouts complete for question ${questionId}!`);
    }

    fetchActiveQuestions();
}

// --- AUTHENTICATION ---
function handleLogin() {
    const enteredPassword = passwordInput.value.trim();
    if (enteredPassword === ADMIN_PASSWORD) {
        sessionStorage.setItem('admin-logged-in', 'true');
        initializeAdminPanel();
    } else {
        alert('Incorrect password.');
        passwordInput.value = '';
    }
}

function handleLogoutAdmin() {
    sessionStorage.removeItem('admin-logged-in');
    supabaseAdmin = null; // Clear the admin client
    adminContent.classList.add('hidden');
    passwordOverlay.classList.remove('hidden');
}

function initializeAdminPanel() {
    // Check if client is already initialized
    if (supabaseAdmin) return; 

    try {
        supabaseAdmin = window.supabase.createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
        // Test query to verify key
        supabaseAdmin.from('questions').select('id', { count: 'exact', head: true }).then(({ error }) => {
            if (error) {
                alert('Login Failed: The hardcoded Service Role Key is invalid.');
                handleLogoutAdmin();
            } else {
                console.log("Admin client initialized successfully.");
                passwordOverlay.classList.add('hidden');
                adminContent.classList.remove('hidden');
                fetchActiveQuestions();
            }
        });
    } catch(e) {
        alert('Login Failed: Could not initialize client.');
    }
}

// --- EVENT LISTENERS ---
passwordSubmit.addEventListener('click', handleLogin);
passwordInput.addEventListener('keyup', e => e.key === 'Enter' && handleLogin());
logoutBtnAdmin.addEventListener('click', handleLogoutAdmin);
createQuestionBtn.addEventListener('click', handleCreateQuestion);

activeQuestionsContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('settle-option-btn')) {
        const btn = e.target;
        const questionId = btn.dataset.questionId;
        const option = btn.dataset.option;
        if (confirm(`Are you sure you want to declare "${option}" as the winner?\nThis action is irreversible and will trigger payouts.`)) {
            btn.disabled = true;
            btn.textContent = 'Processing...';
            handleSetWinner(questionId, option);
        }
    }
});


// On page load, check for a saved login session
const isLoggedIn = sessionStorage.getItem('admin-logged-in');
if (isLoggedIn === 'true') {
    initializeAdminPanel();
}

