const Database = require('better-sqlite3');
const db = new Database('auth.db');
const fs = require('fs');

const user = db.prepare('SELECT id FROM user WHERE email = ?').get('adhitcl@gmail.com');
if (!user) {
  console.log("User adhitcl@gmail.com not found!");
  process.exit(1);
}

const userId = user.id;

db.transaction(() => {
  // Delete other users
  const usersDeleted = db.prepare('DELETE FROM user WHERE email != ?').run('adhitcl@gmail.com').changes;
  db.prepare('DELETE FROM session WHERE userId != ?').run(userId);
  db.prepare('DELETE FROM account WHERE userId != ?').run(userId);
  
  // Clear teams and members
  db.prepare('DELETE FROM team').run();
  try { db.prepare('DELETE FROM teamMember').run(); } catch(e){}
  db.prepare('DELETE FROM member').run();
  db.prepare('DELETE FROM organization').run();
  db.prepare('DELETE FROM invitation').run();
  
  // Re-create a default super admin team / department for the user
  const teamId = 'team-executive';
  db.prepare('INSERT INTO organization (id, name, slug) VALUES (?, ?, ?)').run('org-1', 'Default Org', 'default-org');
  db.prepare('INSERT INTO team (id, name, organizationId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)').run(
    teamId, 'Executive Office', 'org-1', new Date().toISOString(), new Date().toISOString()
  );
  // Re-insert user into this team
  db.prepare('INSERT INTO member (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, ?, ?)').run(
    'mem-1', 'org-1', userId, 'admin', new Date().toISOString()
  );
  try {
      db.prepare('INSERT INTO teamMember (id, teamId, userId, createdAt) VALUES (?, ?, ?, ?)').run(
        'tm-1', teamId, userId, new Date().toISOString()
      );
  } catch (e) {
      console.log("teamMember insert failed, maybe table structure is different: " + e.message);
  }

  console.log(`Deleted ${usersDeleted} other users.`);
})();

console.log("Reset successful.");
