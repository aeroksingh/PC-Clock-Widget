// Data Models
let state = {
    tasks: JSON.parse(localStorage.getItem('prod_tasks')) || [],
    habits: JSON.parse(localStorage.getItem('prod_habits')) || [],
    notes: JSON.parse(localStorage.getItem('prod_notes')) || [],
    timer: { 
        sessions: parseInt(localStorage.getItem('prod_sessions')) || 0, 
        minutes: parseInt(localStorage.getItem('prod_minutes')) || 0 
    },
    settings: JSON.parse(localStorage.getItem('prod_settings')) || { theme: 'dark-theme', font: 'font-inter', minimal: false }
};

function saveData() {
    localStorage.setItem('prod_tasks', JSON.stringify(state.tasks));
    localStorage.setItem('prod_habits', JSON.stringify(state.habits));
    localStorage.setItem('prod_notes', JSON.stringify(state.notes));
    localStorage.setItem('prod_sessions', state.timer.sessions);
    localStorage.setItem('prod_minutes', state.timer.minutes);
    localStorage.setItem('prod_settings', JSON.stringify(state.settings));
    updateAnalytics();
}

// 1. Clock System
function updateClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    document.getElementById('digitalClock').textContent = `${hours}:${minutes}:${seconds}`;
    
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('currentDate').textContent = now.toLocaleDateString(undefined, options);

    // Greeting
    const hour = now.getHours();
    let greeting = 'Good Evening';
    if (hour < 12) greeting = 'Good Morning';
    else if (hour < 18) greeting = 'Good Afternoon';
    document.getElementById('greetingMsg').textContent = greeting;
}
setInterval(updateClock, 1000);
updateClock();

// 2. Daily Briefing & Analytics
function updateAnalytics() {
    const pendingTasks = state.tasks.filter(t => !t.completed).length;
    document.getElementById('pendingTasksStat').textContent = pendingTasks;
    
    // reset habits if next day
    const today = new Date().toDateString();
    let habitsUpdated = false;
    state.habits.forEach(h => {
        if(h.lastChecked !== today && h.checkedToday) {
            h.checkedToday = false;
            habitsUpdated = true;
        }
    });
    if(habitsUpdated) {
        renderHabits(); // Re-render to show unchecked state visually if day changed while app is open
    }

    const habitsDoneToday = state.habits.filter(h => h.checkedToday).length;
    document.getElementById('habitsTodayStat').textContent = `${habitsDoneToday}/${state.habits.length}`;

    document.getElementById('focusSessionsCounter').textContent = state.timer.sessions;
    document.getElementById('focusTimeToday').textContent = state.timer.minutes;
    const tasksDone = state.tasks.filter(t => t.completed).length;
    document.getElementById('tasksCompletedToday').textContent = tasksDone;

    const totalItems = state.tasks.length + state.habits.length;
    const completedItems = tasksDone + habitsDoneToday;
    const progress = totalItems === 0 ? 0 : (completedItems / totalItems) * 100;
    document.getElementById('productivityProgress').style.width = `${progress}%`;
}

// 3. Sticky Notes
function renderNotes() {
    const container = document.getElementById('notesContainer');
    container.innerHTML = '';
    state.notes.forEach((note, index) => {
        const div = document.createElement('div');
        div.className = 'sticky-note';
        div.innerHTML = `
            <button class="note-delete" onclick="deleteNote(${index})"><i class="fas fa-times"></i></button>
            <textarea onchange="updateNote(${index}, this.value)" placeholder="Type a note here...">${note.text}</textarea>
        `;
        container.appendChild(div);
    });
}
function addNote() {
    state.notes.push({ text: '' });
    saveData(); renderNotes();
}
window.deleteNote = (index) => { state.notes.splice(index, 1); saveData(); renderNotes(); };
window.updateNote = (index, text) => { state.notes[index].text = text; saveData(); };
document.getElementById('addNoteBtn').addEventListener('click', addNote);

// 4. Todo Task List
function renderTasks() {
    const list = document.getElementById('taskList');
    list.innerHTML = '';
    state.tasks.forEach((task, index) => {
        const li = document.createElement('li');
        if(task.completed) li.classList.add('task-completed');
        li.innerHTML = `
            <input type="checkbox" ${task.completed ? 'checked' : ''} onchange="toggleTask(${index})">
            <span class="task-label">${task.text}</span>
            <button class="delete-btn" onclick="deleteTask(${index})"><i class="fas fa-trash"></i></button>
        `;
        list.appendChild(li);
    });
    updateAnalytics();
}
function addTask() {
    const input = document.getElementById('taskInput');
    const text = input.value.trim();
    if(text) {
        state.tasks.push({ text, completed: false });
        input.value = '';
        saveData(); renderTasks();
    }
}
window.toggleTask = (index) => { state.tasks[index].completed = !state.tasks[index].completed; saveData(); renderTasks(); };
window.deleteTask = (index) => { state.tasks.splice(index, 1); saveData(); renderTasks(); };
document.getElementById('addTaskBtn').addEventListener('click', addTask);
document.getElementById('taskInput').addEventListener('keypress', e => e.key === 'Enter' && addTask());

// 5. Habit Tracker
function renderHabits() {
    const list = document.getElementById('habitList');
    list.innerHTML = '';
    state.habits.forEach((habit, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <input type="checkbox" ${habit.checkedToday ? 'checked' : ''} onchange="toggleHabit(${index})">
            <span class="habit-label">${habit.text}</span>
            <span class="habit-streak">🔥 ${habit.streak}</span>
            <button class="delete-btn" onclick="deleteHabit(${index})"><i class="fas fa-trash"></i></button>
        `;
        list.appendChild(li);
    });
    updateAnalytics();
}
function addHabit() {
    const input = document.getElementById('habitInput');
    const text = input.value.trim();
    if(text) {
        state.habits.push({ text, streak: 0, checkedToday: false, lastChecked: null });
        input.value = '';
        saveData(); renderHabits();
    }
}
window.toggleHabit = (index) => {
    const habit = state.habits[index];
    habit.checkedToday = !habit.checkedToday;
    const today = new Date().toDateString();
    
    if(habit.checkedToday) {
        habit.streak++;
        habit.lastChecked = today;
    } else {
        habit.streak = Math.max(0, habit.streak - 1);
        habit.lastChecked = null;
    }
    saveData(); renderHabits();
};
window.deleteHabit = (index) => { state.habits.splice(index, 1); saveData(); renderHabits(); };
document.getElementById('addHabitBtn').addEventListener('click', addHabit);
document.getElementById('habitInput').addEventListener('keypress', e => e.key === 'Enter' && addHabit());

// 6. Pomodoro Timer
let timerInterval;
const FOCUS_TIME = 25 * 60;
const BREAK_TIME = 5 * 60;
let timerTime = FOCUS_TIME;
let isTimerRunning = false;
let isBreak = false;

function updateTimerDisplay() {
    const m = String(Math.floor(timerTime / 60)).padStart(2, '0');
    const s = String(timerTime % 60).padStart(2, '0');
    document.getElementById('timerDisplay').textContent = `${m}:${s}`;
}

function startTimer() {
    if(!isTimerRunning) {
        isTimerRunning = true;
        document.getElementById('focusReadyStat').textContent = isBreak ? 'Break Time' : 'Focusing...';
        timerInterval = setInterval(() => {
            timerTime--;
            updateTimerDisplay();
            
            if(timerTime <= 0) {
                clearInterval(timerInterval);
                isTimerRunning = false;
                
                if(!isBreak) {
                    state.timer.sessions++;
                    state.timer.minutes += 25;
                    saveData();
                    alert('Focus session complete! Take a 5 minute break.');
                    isBreak = true;
                    timerTime = BREAK_TIME;
                } else {
                    alert('Break over! Ready to focus?');
                    isBreak = false;
                    timerTime = FOCUS_TIME;
                }
                updateTimerDisplay();
                document.getElementById('focusReadyStat').textContent = 'Focus Timer Ready';
            }
        }, 1000);
    }
}

function pauseTimer() {
    clearInterval(timerInterval);
    isTimerRunning = false;
    document.getElementById('focusReadyStat').textContent = 'Timer Paused';
}

function resetTimer() {
    clearInterval(timerInterval);
    isTimerRunning = false;
    isBreak = false;
    timerTime = FOCUS_TIME;
    updateTimerDisplay();
    document.getElementById('focusReadyStat').textContent = 'Focus Timer Ready';
}

document.getElementById('timerStartBtn').addEventListener('click', startTimer);
document.getElementById('timerPauseBtn').addEventListener('click', pauseTimer);
document.getElementById('timerResetBtn').addEventListener('click', resetTimer);

// 8. Keyboard Shortcuts
document.addEventListener('keydown', e => {
    if(e.ctrlKey && e.shiftKey) {
        switch(e.key.toLowerCase()) {
            case 'n': e.preventDefault(); addNote(); break;
            case 't': e.preventDefault(); document.getElementById('taskInput').focus(); break;
            case 'h': e.preventDefault(); document.getElementById('habitInput').focus(); break;
            case 'f': e.preventDefault(); startTimer(); break;
        }
    }
});

// 10. Settings & Customization
function applySettings() {
    document.body.className = `${state.settings.theme} ${state.settings.font}`;
    if(state.settings.minimal) {
        document.body.classList.add('minimal-mode');
    } else {
        document.body.classList.remove('minimal-mode');
    }
    
    document.getElementById('themeSelect').value = state.settings.theme;
    document.getElementById('fontSelect').value = state.settings.font;
    document.getElementById('minimalModeToggle').checked = state.settings.minimal;
}

document.getElementById('settingsBtn').addEventListener('click', () => {
    document.getElementById('settingsModal').classList.remove('hidden');
});
document.getElementById('closeSettings').addEventListener('click', () => {
    document.getElementById('settingsModal').classList.add('hidden');
});

document.getElementById('themeSelect').addEventListener('change', (e) => {
    state.settings.theme = e.target.value; saveData(); applySettings();
});
document.getElementById('fontSelect').addEventListener('change', (e) => {
    state.settings.font = e.target.value; saveData(); applySettings();
});
document.getElementById('minimalModeToggle').addEventListener('change', (e) => {
    state.settings.minimal = e.target.checked; saveData(); applySettings();
});

// Initialization
renderNotes();
renderTasks();
renderHabits();
updateTimerDisplay();
applySettings();
updateAnalytics();
