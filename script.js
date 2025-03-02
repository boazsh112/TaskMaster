// Global variable for team management
let selectedTeamId = null;

// Team Management Functions
function addTeamMember() {
    const container = document.getElementById('teamMembersContainer');
    const memberDiv = document.createElement('div');
    memberDiv.classList.add('team-member');

    memberDiv.innerHTML = `
        <input type="text" class="member-name" placeholder="Member Name" required>
        <input type="number" class="member-rating" placeholder="Rating" required step="0.1" min="0.1">
        <button type="button" onclick="removeMember(this)">Remove</button>
    `;

    container.appendChild(memberDiv);
}

function removeMember(button) {
    button.parentElement.remove();
}

function saveTeam() {
    const teamName = document.getElementById('teamName').value;
    if (!teamName) {
        displayError('Team name is required');
        return;
    }

    const teamMembers = [];
    const memberInputs = document.querySelectorAll('.team-member');

    if (memberInputs.length === 0) {
        displayError('At least one team member is required');
        return;
    }

    memberInputs.forEach(member => {
        const name = member.querySelector('.member-name').value;
        const rating = parseFloat(member.querySelector('.member-rating').value);

        if (!name || !rating) {
            displayError('All team member fields are required');
            return;
        }

        teamMembers.push({ name, rating });
    });

    fetch('http://127.0.0.1:5000/save-team', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: teamName,
            members: teamMembers
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('Team saved successfully!');
            selectedTeamId = data.team_id;
            loadTeams();
        } else {
            displayError(data.error || 'Failed to save team');
        }
    })
    .catch(error => {
        displayError('Error saving team: ' + error);
    });
}

function loadTeams() {
    fetch('http://127.0.0.1:5000/teams')
        .then(response => response.json())
        .then(teams => {
            const container = document.getElementById('teamMembersContainer');
            container.innerHTML = '';

            if (teams.length === 0) {
                container.innerHTML = '<p>No teams available</p>';
                return;
            }

            const teamSelect = document.createElement('select');
            teamSelect.id = 'teamSelect';
            teamSelect.innerHTML = '<option value="">Select a team</option>';

            teams.forEach(team => {
                const option = document.createElement('option');
                option.value = team.id;
                option.textContent = team.name;
                teamSelect.appendChild(option);
            });

            teamSelect.addEventListener('change', (e) => {
                selectedTeamId = e.target.value;
                if (selectedTeamId) {
                    loadTeamMembers(selectedTeamId);
                }
            });

            container.appendChild(teamSelect);
        })
        .catch(error => displayError('Error loading teams: ' + error));
}

function loadTeamMembers(teamId) {
    fetch(`http://127.0.0.1:5000/team-members/${teamId}`)
        .then(response => response.json())
        .then(members => {
            const container = document.getElementById('teamMembersContainer');
            const membersList = document.createElement('div');
            membersList.classList.add('team-members-list');

            members.forEach(member => {
                const memberDiv = document.createElement('div');
                memberDiv.classList.add('team-member-display');
                memberDiv.innerHTML = `
                    <span>${member.name}</span>
                    <span>Rating: ${member.rating}</span>
                `;
                membersList.appendChild(memberDiv);
            });

            // Keep the select element and add members list below it
            const select = container.querySelector('select');
            container.innerHTML = '';
            container.appendChild(select);
            container.appendChild(membersList);
        })
        .catch(error => displayError('Error loading team members: ' + error));
}

// Task Management Functions
function generateTaskInputs() {
    const numTasks = document.getElementById('numTasks').value;
    if (!numTasks || numTasks <= 0) {
        displayError('Please enter a valid number of tasks');
        return;
    }

    const taskDaysContainer = document.getElementById('taskDaysContainer');
    taskDaysContainer.innerHTML = '';

    const taskLabel = document.createElement('label');
    taskLabel.textContent = 'Number of days for task:';
    taskDaysContainer.appendChild(taskLabel);

    for (let j = 0; j < numTasks; j++) {
        const taskDiv = document.createElement('div');
        taskDiv.classList.add('task-inputs');

        const input = document.createElement('input');
        input.type = 'number';
        input.name = `taskDay${j}`;
        input.placeholder = `Task ${j + 1}`;
        input.required = true;
        input.step = '0.01';
        input.min = '0.1';
        taskDiv.appendChild(input);

        taskDaysContainer.appendChild(taskDiv);
    }
}

// Form Submission and Validation
document.getElementById('taskForm').addEventListener('submit', async function (event) {
    event.preventDefault();

    if (!selectedTeamId) {
        displayError('Please select a team first');
        return;
    }

    if (!validateForm()) {
        return;
    }

    const formData = new FormData(document.getElementById('taskForm'));
    const sprintFormData = new FormData(document.getElementById('sprintForm'));

    const data = {
        teamId: selectedTeamId
    };

    formData.forEach((value, key) => {
        data[key] = value;
    });
    sprintFormData.forEach((value, key) => {
        data[key] = value;
    });

    try {
        const response = await fetch('http://127.0.0.1:5000/solve', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            const result = await response.json();
            if (result.error) {
                displayError(result.error);
            } else {
                displayResult(result);
            }
        } else {
            displayError('Server Error: ' + response.statusText);
        }
    } catch (error) {
        displayError('Network Error: ' + error.message);
    }
});

function validateForm() {
    const taskForm = document.getElementById('taskForm');
    const sprintForm = document.getElementById('sprintForm');

    const fields = [...taskForm.elements, ...sprintForm.elements];
    const incompleteFields = fields.filter(field => field.required && !field.value);

    incompleteFields.forEach(field => {
        field.style.border = '2px solid red';
    });

    if (incompleteFields.length > 0) {
        const fieldNames = incompleteFields.map(field => field.name).join(', ');
        displayError(`The following fields are required: ${fieldNames}`);
        return false;
    }

    const maxDaysField = document.getElementById('maxDays');
    const maxDays = parseFloat(maxDaysField.value);
    if (maxDays <= 0 || isNaN(maxDays)) {
        maxDaysField.style.border = '2px solid red';
        displayError('Sprint Length in Days must be a positive number greater than 0.');
        return false;
    }

    const invalidTaskDays = [];
    fields.forEach(field => {
        if (field.name.startsWith('taskDay')) {
            const taskDay = parseFloat(field.value);
            if (taskDay <= 0 || isNaN(taskDay)) {
                invalidTaskDays.push(field.name);
                field.style.border = '2px solid red';
            } else {
                field.style.border = '';
            }
        }
    });

    if (invalidTaskDays.length > 0) {
        displayError(`Task days must be positive numbers greater than 0. Invalid fields: ${invalidTaskDays.join(', ')}`);
        return false;
    }

    return true;
}

// Results Display Functions
function displayError(error) {
    const output = document.getElementById('output');
    output.innerHTML = '';

    const errorMessage = document.createElement('p');
    errorMessage.classList.add('error');
    errorMessage.textContent = `Error: ${error}`;
    output.appendChild(errorMessage);
}

// פונקציה להצגת תוצאה בודדת (מיד אחרי החישוב)
function displayResult(result) {
    const output = document.getElementById('output');
    output.innerHTML = '';

    // מחקנו את הקריאה ל-saveResult מכאן

    const totalCompletionTime = document.createElement('h2');
    totalCompletionTime.textContent = `Number of days to finish the tasks: ${result.work_days.toFixed(2)} days`;
    output.appendChild(totalCompletionTime);

    result.assignments.forEach(assignment => {
        const workerDiv = document.createElement('div');
        workerDiv.classList.add('result-item');

        const workerTitle = document.createElement('h3');
        workerTitle.textContent = assignment.worker;
        workerDiv.appendChild(workerTitle);

        const totalTime = document.createElement('p');
        totalTime.textContent = `Total Time: ${assignment.total_time.toFixed(2)} days`;
        workerDiv.appendChild(totalTime);

        const taskList = document.createElement('ul');
        taskList.classList.add('task-list');

        assignment.tasks.forEach(task => {
            const taskItem = document.createElement('li');
            taskItem.textContent = `Task ${task.task}: ${task.time.toFixed(2)} days`;
            taskList.appendChild(taskItem);
        });

        workerDiv.appendChild(taskList);
        output.appendChild(workerDiv);
    });

    const status = document.createElement('p');
    status.textContent = `Status: ${result.status}`;
    output.appendChild(status);

    const timeDifference = document.createElement('p');
    timeDifference.textContent = `Time Difference between workers: ${result.time_difference.toFixed(2)} days`;
    output.appendChild(timeDifference);

    const maxWorkerTime = document.createElement('p');
    maxWorkerTime.textContent = `Max Worker Time: ${result.work_days.toFixed(2)} days`;
    output.appendChild(maxWorkerTime);

    const minWorkerTime = document.createElement('p');
    minWorkerTime.textContent = `Min Worker Time: ${result.min_worker_time.toFixed(2)} days`;
    output.appendChild(minWorkerTime);

    const exceedsMaxDays = document.createElement('p');
    exceedsMaxDays.textContent = `Exceeds Max Days: ${result.exceeds_max_days ? 'Yes' : 'No'}`;
    if (result.exceeds_max_days) {
        exceedsMaxDays.classList.add('error');
    }
    output.appendChild(exceedsMaxDays);
}

// פונקציה להצגת היסטוריית תוצאות
async function displayResultsHistory() {
    const output = document.getElementById('output');
    output.innerHTML = '<h2>Results History</h2>';

    try {
        const response = await fetch('http://127.0.0.1:5000/results-history');
        if (!response.ok) {
            throw new Error('Failed to fetch results history');
        }

        const resultsHistory = await response.json();

        resultsHistory.forEach(result => {
            const resultDiv = document.createElement('div');
            resultDiv.classList.add('result-item');

            const resultTitle = document.createElement('h3');
            resultTitle.textContent = `Result #${result.id}`;
            resultDiv.appendChild(resultTitle);

            const timestamp = document.createElement('p');
            timestamp.textContent = `Submitted on: ${result.timestamp}`;
            resultDiv.appendChild(timestamp);

            const totalCompletionTime = document.createElement('p');
            totalCompletionTime.textContent = `Number of days to finish the tasks: ${result.work_days.toFixed(2)} days`;
            resultDiv.appendChild(totalCompletionTime);

            result.assignments.forEach(assignment => {
                const workerDiv = document.createElement('div');
                workerDiv.classList.add('result-item');

                const workerTitle = document.createElement('h4');
                workerTitle.textContent = assignment.worker;
                workerDiv.appendChild(workerTitle);

                const totalTime = document.createElement('p');
                totalTime.textContent = `Total Time: ${assignment.total_time.toFixed(2)} days`;
                workerDiv.appendChild(totalTime);

                const taskList = document.createElement('ul');
                taskList.classList.add('task-list');

                assignment.tasks.forEach(task => {
                    const taskItem = document.createElement('li');
                    taskItem.textContent = `Task ${task.task}: ${task.time.toFixed(2)} days`;
                    taskList.appendChild(taskItem);
                });

                workerDiv.appendChild(taskList);
                resultDiv.appendChild(workerDiv);
            });

            const timeDifference = document.createElement('p');
            timeDifference.textContent = `Time Difference between workers: ${result.time_difference.toFixed(2)} days`;
            resultDiv.appendChild(timeDifference);

            const maxWorkerTime = document.createElement('p');
            maxWorkerTime.textContent = `Max Worker Time: ${result.work_days.toFixed(2)} days`;
            resultDiv.appendChild(maxWorkerTime);

            const minWorkerTime = document.createElement('p');
            minWorkerTime.textContent = `Min Worker Time: ${result.min_worker_time.toFixed(2)} days`;
            resultDiv.appendChild(minWorkerTime);

            const exceedsMaxDays = document.createElement('p');
            exceedsMaxDays.textContent = `Exceeds Max Days: ${result.exceeds_max_days ? 'Yes' : 'No'}`;
            if (result.exceeds_max_days) {
                exceedsMaxDays.classList.add('error');
            }
            resultDiv.appendChild(exceedsMaxDays);

            output.appendChild(resultDiv);
        });

    } catch (error) {
        output.innerHTML = `<p class="error">Error loading results history: ${error.message}</p>`;
    }
}

function editTeam() {
    if (!selectedTeamId) {
        displayError('Please select a team first');
        return;
    }

    const membersList = document.querySelector('.team-members-list');
    if (!membersList) {
        displayError('No team members found');
        return;
    }

    // הופך את תצוגת חברי הצוות למצב עריכה
    const members = membersList.querySelectorAll('.team-member-display');
    members.forEach(member => {
        const memberName = member.querySelector('span:first-child').textContent;
        const memberRating = parseFloat(member.querySelector('span:last-child').textContent.replace('Rating: ', ''));
        const userId = member.dataset.userId;

        member.innerHTML = `
            <input type="text" class="member-name-edit" value="${memberName}">
            <input type="number" class="member-rating-edit" value="${memberRating}" step="0.1" min="0.1">
            <button onclick="removeMemberFromTeam(this)" data-user-id="${userId}">Remove</button>
        `;
        member.dataset.userId = userId;
    });

    // הוספת כפתור Save Changes אם עוד לא קיים
    if (!membersList.querySelector('.save-changes-btn')) {
        const saveButton = document.createElement('button');
        saveButton.textContent = 'Save Changes';
        saveButton.className = 'save-changes-btn';
        saveButton.onclick = saveTeamChanges;
        membersList.appendChild(saveButton);
    }
}

async function saveTeamChanges() {
    if (!selectedTeamId) {
        displayError('No team selected');
        return;
    }

    const memberElements = document.querySelectorAll('.team-member-display');
    const updatedMembers = [];

    memberElements.forEach(member => {
        const nameInput = member.querySelector('.member-name-edit');
        const ratingInput = member.querySelector('.member-rating-edit');
        const userId = member.dataset.userId;

        // בודק אם החבר מסומן למחיקה
        if (member.classList.contains('marked-for-removal')) {
            updatedMembers.push({
                id: userId,
                action: 'remove'
            });
        } else {
            updatedMembers.push({
                id: userId,
                name: nameInput.value,
                rating: parseFloat(ratingInput.value),
                action: 'update'
            });
        }
    });

    try {
        const response = await fetch(`http://127.0.0.1:5000/update-team/${selectedTeamId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                members: updatedMembers
            })
        });

        const data = await response.json();

        if (data.success) {
            alert('Team updated successfully!');
            // טוען מחדש את חברי הצוות לאחר העדכון
            loadTeamMembers(selectedTeamId);
        } else {
            displayError(data.error || 'Failed to update team');
        }
    } catch (error) {
        displayError('Error updating team: ' + error.message);
    }
}

function removeMemberFromTeam(button) {
    const memberElement = button.parentElement;
    if (confirm('Are you sure you want to remove this member?')) {
        memberElement.classList.add('marked-for-removal');  // סימון למחיקה במקום הסרה מיידית
        memberElement.style.opacity = '0.5';  // חיווי ויזואלי שהמשתמש מסומן למחיקה
    }
}

function saveTeam() {
    const teamName = document.getElementById('teamName').value;
    if (!teamName) {
        displayError('Team name is required');
        return;
    }

    const teamMembers = [];
    const memberInputs = document.querySelectorAll('.team-member');

    if (memberInputs.length === 0) {
        displayError('At least one team member is required');
        return;
    }

    memberInputs.forEach(member => {
        // שינוי: גישה לאלמנטים הנכונים
        const name = member.querySelector('.member-name').value;
        const rating = parseFloat(member.querySelector('.member-rating').value);

        if (!name || isNaN(rating)) {
            displayError('All team member fields are required');
            return;
        }

        teamMembers.push({ name, rating });
    });

    fetch('http://127.0.0.1:5000/save-team', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: teamName,
            members: teamMembers
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('Team saved successfully!');
            selectedTeamId = data.team_id;
            loadTeams();

            // ניקוי הטופס לאחר שמירה מוצלחת
            document.getElementById('teamName').value = '';
            document.getElementById('teamMembersContainer').innerHTML = '';
        } else {
            if (data.error === "Team name already exists") {
                displayError('A team with this name already exists. Please choose a different name.');
            } else {
                displayError(data.error || 'Failed to save team');
            }
        }
    })
    .catch(error => {
        displayError('Error saving team: ' + error);
    });
}

// וגם נוודא שכאשר מוסיפים חבר צוות חדש, הקלאסים נכונים
function addTeamMember() {
    const container = document.getElementById('teamMembersContainer');
    const memberDiv = document.createElement('div');
    memberDiv.classList.add('team-member');

    memberDiv.innerHTML = `
        <input type="text" class="member-name" placeholder="Member Name" required>
        <input type="number" class="member-rating" placeholder="Rating" required step="0.1" min="0.1">
        <button type="button" onclick="removeMember(this)">Remove</button>
    `;

    container.appendChild(memberDiv);
}

// עדכון פונקציית loadTeamMembers הקיימת
function loadTeamMembers(teamId) {
    fetch(`http://127.0.0.1:5000/team-members/${teamId}`)
        .then(response => response.json())
        .then(members => {
            const container = document.getElementById('teamMembersContainer');
            const membersList = document.createElement('div');
            membersList.classList.add('team-members-list');

            members.forEach(member => {
                const memberDiv = document.createElement('div');
                memberDiv.classList.add('team-member-display');
                memberDiv.dataset.userId = member.id;  // שמירת ID של המשתמש
                memberDiv.innerHTML = `
                    <span>${member.name}</span>
                    <span>Rating: ${member.rating}</span>
                `;
                membersList.appendChild(memberDiv);
            });

            const select = container.querySelector('select');
            container.innerHTML = '';
            container.appendChild(select);
            container.appendChild(membersList);
        });
}