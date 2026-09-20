const fs = require('fs');
const dataStorePath = 'data_store.json';
if (fs.existsSync(dataStorePath)) {
  const data = JSON.parse(fs.readFileSync(dataStorePath, 'utf8'));
  
  // Filter out any user that is not adhitcl@gmail.com
  if (data.allowedUsers) {
    data.allowedUsers = data.allowedUsers.filter(u => u.email === 'adhitcl@gmail.com');
    // Update department to Executive Office
    if (data.allowedUsers.length > 0) {
      data.allowedUsers[0].department = "Executive Office";
      data.allowedUsers[0].role = "Superuser"; // Make sure role is Superuser
    }
  }

  fs.writeFileSync(dataStorePath, JSON.stringify(data, null, 2));
  console.log("Updated data_store.json allowedUsers");
}
