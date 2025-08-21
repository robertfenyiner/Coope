const db = require('./database');

console.log('Verificando archivos subidos...');

// Verificar archivos en la base de datos
db.all('SELECT * FROM file_attachments WHERE file_type = "profile" ORDER BY created_at DESC LIMIT 5', (err, rows) => {
  if (err) {
    console.error('Error consultando base de datos:', err);
    return;
  }
  
  console.log('\n=== ARCHIVOS DE PERFIL EN BASE DE DATOS ===');
  if (rows.length === 0) {
    console.log('No hay archivos de perfil en la base de datos');
  } else {
    rows.forEach(row => {
      console.log(`ID: ${row.id}, Filename: ${row.file_name}, Path: ${row.file_path}, Size: ${row.file_size}`);
    });
  }
  
  // Verificar usuarios con fotos de perfil
  db.all('SELECT id, username, profile_picture FROM users WHERE profile_picture IS NOT NULL', (err, users) => {
    if (err) {
      console.error('Error consultando usuarios:', err);
      return;
    }
    
    console.log('\n=== USUARIOS CON FOTOS DE PERFIL ===');
    if (users.length === 0) {
      console.log('No hay usuarios con fotos de perfil');
    } else {
      users.forEach(user => {
        console.log(`Usuario: ${user.username}, Foto: ${user.profile_picture}`);
      });
    }
    
    process.exit(0);
  });
});