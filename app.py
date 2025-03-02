from flask import Flask, request, jsonify
from flask_cors import CORS
import pulp
import pyodbc

app = Flask(__name__)
CORS(app)


# === Database Connection ===
import pyodbc

def get_db_connection():
    connection = pyodbc.connect(
        "DRIVER={SQL Server};"
        "SERVER=localhost;"  # אם אתה עובד עם שרת מרוחק, עדכן כאן
        "DATABASE=taskmaster;"
        "UID=sa;"  # עדכן את שם המשתמש שלך אם שונה
        "PWD=293758;"
    )
    return connection



# === Database Functions - Teams ===
def save_team_data(team_name):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO teams (name) VALUES (%s)",
            (team_name,)
        )
        conn.commit()
        team_id = cursor.lastrowid
        return team_id
    except mysql.connector.Error as err:
        print(f"Error saving team: {err}")
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


def check_user_exists_in_any_team(name):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT t.name as team_name 
            FROM users u
            JOIN team_members tm ON u.id = tm.user_id
            JOIN teams t ON tm.team_id = t.id
            WHERE u.name = %s
        """, (name,))
        result = cursor.fetchone()
        return result[0] if result else None
    finally:
        cursor.close()
        conn.close()


# === Database Functions - Users ===
def save_user(name, rating, team_id=None):
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # בדיקת קיום העובד
        cursor.execute("SELECT id FROM users WHERE name = %s", (name,))
        existing_user = cursor.fetchone()

        if existing_user:
            user_id = existing_user[0]
            cursor.execute("UPDATE users SET rating = %s WHERE id = %s", (rating, user_id))
        else:
            cursor.execute("INSERT INTO users (name, rating) VALUES (%s, %s)", (name, rating))
            user_id = cursor.lastrowid

        # אם נשלח team_id, מקשרים את העובד לצוות
        if team_id:
            cursor.execute(
                "INSERT INTO team_members (team_id, user_id) VALUES (%s, %s)",
                (team_id, user_id)
            )

        conn.commit()
        return user_id
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        cursor.close()
        conn.close()


# === Database Functions - Tasks & Results ===
def save_task(name, estimated_time):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO tasks (name, estimated_time) VALUES (%s, %s)",
            (name, estimated_time)
        )
        conn.commit()
        task_id = cursor.lastrowid
        return task_id
    finally:
        cursor.close()
        conn.close()


def save_assignment(task_id, user_id, time_taken, result_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO assignments (task_id, user_id, time_taken, result_id) VALUES (%s, %s, %s, %s)",
            (task_id, user_id, time_taken, result_id)
        )
        conn.commit()
        assignment_id = cursor.lastrowid
        return assignment_id
    finally:
        cursor.close()
        conn.close()


def save_result(work_days, min_worker_time, time_difference, exceeds_max_days, sprint_length):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO Result (
                work_days, 
                min_worker_time, 
                time_difference, 
                exceeds_max_days, 
                sprint_length
            ) VALUES (%s, %s, %s, %s, %s)
            """,
            (work_days, min_worker_time, time_difference, exceeds_max_days, sprint_length)
        )
        conn.commit()
        result_id = cursor.lastrowid
        return result_id
    finally:
        cursor.close()
        conn.close()


# === API Routes - Teams ===
@app.route('/teams', methods=['GET'])
def get_teams():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, name FROM teams")
        teams = [{"id": row[0], "name": row[1]} for row in cursor.fetchall()]
        return jsonify(teams)
    finally:
        cursor.close()
        conn.close()


@app.route('/team-members/<int:team_id>', methods=['GET'])
def get_team_members(team_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT u.id, u.name, u.rating
            FROM users u
            JOIN team_members tm ON u.id = tm.user_id
            WHERE tm.team_id = %s
        """, (team_id,))
        members = [{"id": row[0], "name": row[1], "rating": row[2]} for row in cursor.fetchall()]
        return jsonify(members)
    finally:
        cursor.close()
        conn.close()


@app.route('/save-team', methods=['POST'])
def save_team():
    data = request.json
    try:
        team_name = data.get('name')

        if not team_name:
            return jsonify({
                "success": False,
                "error": "Team name is required"
            })

        conn = get_db_connection()
        cursor = conn.cursor()

        # בדיקה אם קיים כבר צוות עם אותו שם
        cursor.execute("SELECT id FROM teams WHERE name = %s", (team_name,))
        existing_team = cursor.fetchone()

        if existing_team:
            return jsonify({
                "success": False,
                "error": "Team name already exists"
            })

        cursor.close()
        conn.close()

        # בדיקה אם אחד מחברי הצוות כבר קיים בקבוצה אחרת
        for member in data['members']:
            existing_team = check_user_exists_in_any_team(member['name'])
            if existing_team:
                return jsonify({
                    "success": False,
                    "error": f"User {member['name']} is already a member of team '{existing_team}'"
                })

        # שמירת הצוות
        team_id = save_team_data(team_name)

        # שמירת חברי הצוות
        for member in data['members']:
            user_id = save_user(member['name'], member['rating'], team_id)

        return jsonify({"success": True, "team_id": team_id})

    except Exception as e:
        print(f"Error in save_team: {str(e)}")
        return jsonify({"success": False, "error": str(e)})


@app.route('/update-team/<int:team_id>', methods=['PUT'])
def update_team(team_id):
    data = request.json
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # בדיקת חברי צוות חדשים אם הם קיימים בקבוצות אחרות
        for member in data['members']:
            if member.get('action') == 'update':
                cursor.execute("""
                    SELECT team_id 
                    FROM team_members tm
                    JOIN users u ON tm.user_id = u.id
                    WHERE u.name = %s AND u.id != %s
                """, (member['name'], member.get('id')))

                existing_team = cursor.fetchone()
                if existing_team and existing_team[0] != team_id:
                    return jsonify({
                        "success": False,
                        "error": f"User {member['name']} is already a member of another team"
                    })

        # עדכון חברי צוות
        if 'members' in data:
            for member in data['members']:
                action = member.get('action')
                member_id = member.get('id')

                if action == 'update':
                    cursor.execute("""
                        UPDATE users u 
                        JOIN team_members tm ON u.id = tm.user_id 
                        SET u.name = %s, u.rating = %s 
                        WHERE tm.team_id = %s AND u.id = %s
                    """, (member['name'], member['rating'], team_id, member_id))
                elif action == 'remove':
                    cursor.execute("""
                        DELETE FROM team_members 
                        WHERE team_id = %s AND user_id = %s
                    """, (team_id, member_id))

        conn.commit()
        return jsonify({"success": True})
    except Exception as e:
        conn.rollback()
        return jsonify({"success": False, "error": str(e)})
    finally:
        cursor.close()
        conn.close()


# === API Routes - Task Assignment ===
@app.route('/solve', methods=['POST'])
def solve():
    data = request.json

    try:
        team_id = int(data['teamId'])
        num_tasks = int(data['numTasks'])
        max_days = float(data['maxDays'])
        task_days = [float(data[f'taskDay{j}']) for j in range(num_tasks)]
    except KeyError as e:
        return jsonify({"error": f"Missing data: {str(e)}"}), 400
    except ValueError as e:
        return jsonify({"error": f"Invalid data format: {str(e)}"}), 400

    result = solve_task_assignment(
        team_id,
        num_tasks,
        task_days,
        max_days
    )
    return jsonify(result)


@app.route('/results-history', methods=['GET'])
def get_results_history():
    """Get all results history with their assignments"""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # Get all results with their basic info
        cursor.execute("""
            SELECT 
                r.id,
                r.work_days,
                r.min_worker_time,
                r.time_difference,
                r.exceeds_max_days,
                r.sprint_length,
                r.created_at
            FROM result r
            ORDER BY r.created_at DESC
        """)
        results = cursor.fetchall()

        # For each result, get its assignments
        for result in results:
            cursor.execute("""
                SELECT 
                    u.name as worker,
                    t.name as task_name,
                    a.time_taken,
                    t.id as task_id
                FROM assignments a
                JOIN users u ON a.user_id = u.id
                JOIN tasks t ON a.task_id = t.id
                WHERE a.result_id = %s
            """, (result['id'],))
            assignments = cursor.fetchall()

            # ארגון ההקצאות לפי עובד
            workers_assignments = {}
            for assignment in assignments:
                worker = assignment['worker']
                if worker not in workers_assignments:
                    workers_assignments[worker] = {
                        'worker': worker,
                        'tasks': [],
                        'total_time': 0
                    }

                workers_assignments[worker]['tasks'].append({
                    'task': assignment['task_id'],  # משתמשים ב-ID כדי לשמור על התאימות
                    'time': assignment['time_taken']
                })
                workers_assignments[worker]['total_time'] += assignment['time_taken']

            result['assignments'] = list(workers_assignments.values())
            result['timestamp'] = result['created_at'].strftime('%Y-%m-%d %H:%M:%S')

        return jsonify(results)

    finally:
        cursor.close()
        conn.close()


def solve_task_assignment(team_id, num_tasks, task_days, max_days):
    conn = get_db_connection()
    cursor = conn.cursor()

    # השגת פרטי הצוות
    cursor.execute("""
        SELECT u.id, u.name, u.rating
        FROM users u
        JOIN team_members tm ON u.id = tm.user_id
        WHERE tm.team_id = %s
    """, (team_id,))

    team_members = cursor.fetchall()
    cursor.close()
    conn.close()

    if not team_members:
        raise ValueError("No team members found")

    num_workers = len(team_members)
    worker_names = [member[1] for member in team_members]
    worker_ratings = [member[2] for member in team_members]

    prob = pulp.LpProblem("TaskAssignment", pulp.LpMinimize)

    x = pulp.LpVariable.dicts("x", ((i, j) for i in range(num_workers) for j in range(num_tasks)), cat='Binary')
    max_time = pulp.LpVariable("max_time", lowBound=0)
    min_time = pulp.LpVariable("min_time", lowBound=0)

    prob += max_time - min_time + pulp.lpSum(
        task_days[j] * worker_ratings[i] * x[(i, j)] for i in range(num_workers) for j in range(num_tasks)
    )

    for j in range(num_tasks):
        prob += pulp.lpSum(x[(i, j)] for i in range(num_workers)) == 1

    if num_tasks >= num_workers:
        for i in range(num_workers):
            prob += pulp.lpSum(x[(i, j)] for j in range(num_tasks)) >= 1

    worker_times = [pulp.lpSum(task_days[j] * worker_ratings[i] * x[(i, j)] for j in range(num_tasks)) for i in
                    range(num_workers)]
    for i in range(num_workers):
        prob += worker_times[i] <= max_time
        prob += worker_times[i] >= min_time

    prob.solve()

    work_days = max([pulp.value(worker_time) for worker_time in worker_times]) if worker_times else 0
    min_worker_time = min(
        [pulp.value(worker_time) for worker_time in worker_times if pulp.value(worker_time) > 0]) if worker_times else 0
    time_difference = work_days - min_worker_time
    exceeds_max_days = work_days > max_days

    result_id = save_result(
        work_days, min_worker_time, time_difference, exceeds_max_days, max_days
    )

    task_ids = {}
    for j in range(num_tasks):
        task_id = save_task(f"Task {j + 1}", task_days[j])
        task_ids[j] = task_id

    assignments = []
    for i in range(num_workers):
        worker_tasks = []
        total_time = 0
        for j in range(num_tasks):
            if pulp.value(x[(i, j)]) == 1:
                calculated_time = task_days[j] * worker_ratings[i]
                task_id = task_ids[j]
                user_id = team_members[i][0]

                save_assignment(task_id, user_id, calculated_time, result_id)

                worker_tasks.append({
                    "task": j + 1,
                    "time": calculated_time
                })
                total_time += calculated_time

        assignments.append({
            "worker": worker_names[i],
            "tasks": worker_tasks,
            "total_time": total_time
        })

    return {
        "status": pulp.LpStatus[prob.status],
        "assignments": assignments,
        "work_days": work_days,
        "min_worker_time": min_worker_time,
        "time_difference": time_difference,
        "exceeds_max_days": exceeds_max_days
    }


# === Test Route ===
@app.route('/test-db', methods=['GET'])
def test_db():
    try:
        conn = get_db_connection()
        conn.close()
        return jsonify({"message": "Database connection successful"}), 200
    except mysql.connector.Error as err:
        return jsonify({"error": f"Database connection failed: {str(err)}"}), 500


if __name__ == '__main__':
    app.run(debug=True)