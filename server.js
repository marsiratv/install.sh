// server.js - Backend API untuk IPTV Panel Pro
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database setup
const db = new sqlite3.Database('./iptv_panel.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
    initDatabase();
  }
});

// Initialize database tables
function initDatabase() {
  db.serialize(() => {
    // Admin users table
    db.run(`CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      email TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Packages table
    db.run(`CREATE TABLE IF NOT EXISTS packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      channels INTEGER NOT NULL,
      duration INTEGER NOT NULL,
      price REAL NOT NULL,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Users/Subscribers table
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      package_id INTEGER,
      device TEXT,
      status TEXT DEFAULT 'active',
      expiry_date DATETIME,
      last_seen DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (package_id) REFERENCES packages(id)
    )`);

    // Channels table
    db.run(`CREATE TABLE IF NOT EXISTS channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      logo TEXT,
      category TEXT,
      package_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (package_id) REFERENCES packages(id)
    )`);

    // Transactions table
    db.run(`CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      package_id INTEGER,
      amount REAL,
      status TEXT DEFAULT 'completed',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (package_id) REFERENCES packages(id)
    )`);

    // Insert default admin if not exists
    db.get('SELECT * FROM admins WHERE username = ?', ['admin'], (err, row) => {
      if (!row) {
        bcrypt.hash('admin123', 10, (err, hash) => {
          db.run('INSERT INTO admins (username, password, email) VALUES (?, ?, ?)', 
            ['admin', hash, 'admin@iptv.com']);
          console.log('Default admin created - username: admin, password: admin123');
        });
      }
    });

    // Insert sample packages if empty
    db.get('SELECT COUNT(*) as count FROM packages', (err, row) => {
      if (row.count === 0) {
        const samplePackages = [
          ['Basic Plan', 150, 30, 15],
          ['Premium Plan', 300, 30, 30],
          ['VIP Plan', 500, 30, 50]
        ];
        
        samplePackages.forEach(pkg => {
          db.run('INSERT INTO packages (name, channels, duration, price) VALUES (?, ?, ?, ?)', pkg);
        });
        console.log('Sample packages created');
      }
    });

    // Insert sample users
    db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
      if (row.count === 0) {
        bcrypt.hash('user123', 10, (err, hash) => {
          const sampleUsers = [
            ['user001', hash, 1, 'Android', 'active'],
            ['user002', hash, 2, 'iOS', 'active'],
            ['user003', hash, 3, 'Smart TV', 'active'],
            ['user004', hash, 1, 'Android', 'expired']
          ];
          
          sampleUsers.forEach(user => {
            const expiryDate = user[4] === 'active' 
              ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
              : new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
            
            db.run(`INSERT INTO users (username, password, package_id, device, status, expiry_date, last_seen) 
                    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`, 
              [...user, expiryDate]);
          });
          console.log('Sample users created');
        });
      }
    });
  });
}

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// ============ AUTH ROUTES ============

// Admin login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;

  db.get('SELECT * FROM admins WHERE username = ?', [username], (err, admin) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    bcrypt.compare(password, admin.password, (err, result) => {
      if (result) {
        const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, admin: { id: admin.id, username: admin.username, email: admin.email } });
      } else {
        res.status(401).json({ error: 'Invalid credentials' });
      }
    });
  });
});

// User login (for IPTV app)
app.post('/api/auth/user-login', (req, res) => {
  const { username, password } = req.body;

  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    bcrypt.compare(password, user.password, (err, result) => {
      if (result) {
        // Update last seen
        db.run('UPDATE users SET last_seen = datetime("now") WHERE id = ?', [user.id]);
        
        const token = jwt.sign({ id: user.id, username: user.username, type: 'user' }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user.id, username: user.username, status: user.status, expiry_date: user.expiry_date } });
      } else {
        res.status(401).json({ error: 'Invalid credentials' });
      }
    });
  });
});

// ============ DASHBOARD ROUTES ============

// Get dashboard stats
app.get('/api/dashboard/stats', authenticateToken, (req, res) => {
  const stats = {};

  // Get total revenue
  db.get('SELECT SUM(amount) as total FROM transactions WHERE status = "completed"', (err, row) => {
    stats.totalRevenue = row.total || 0;
    
    // Get today's revenue
    db.get(`SELECT SUM(amount) as today FROM transactions 
            WHERE status = "completed" AND date(created_at) = date('now')`, (err, row) => {
      stats.todayRevenue = row.today || 0;
      
      // Get active users
      db.get('SELECT COUNT(*) as count FROM users WHERE status = "active"', (err, row) => {
        stats.activeUsers = row.count || 0;
        
        // Get new users this week
        db.get(`SELECT COUNT(*) as count FROM users 
                WHERE created_at >= date('now', '-7 days')`, (err, row) => {
          stats.newUsersThisWeek = row.count || 0;
          
          // Get total channels
          db.get('SELECT COUNT(*) as count FROM channels', (err, row) => {
            stats.totalChannels = row.count || 0;
            
            // Get total packages
            db.get('SELECT COUNT(*) as count FROM packages', (err, row) => {
              stats.totalPackages = row.count || 0;
              
              res.json(stats);
            });
          });
        });
      });
    });
  });
});

// Get recent activity
app.get('/api/dashboard/activity', authenticateToken, (req, res) => {
  db.all(`SELECT id, username, device, status, 
          CASE 
            WHEN (julianday('now') - julianday(last_seen)) * 24 * 60 < 60 THEN 
              CAST((julianday('now') - julianday(last_seen)) * 24 * 60 AS INTEGER) || ' min ago'
            WHEN (julianday('now') - julianday(last_seen)) * 24 < 24 THEN 
              CAST((julianday('now') - julianday(last_seen)) * 24 AS INTEGER) || ' hours ago'
            ELSE 
              CAST((julianday('now') - julianday(last_seen)) AS INTEGER) || ' days ago'
          END as lastSeen
          FROM users 
          ORDER BY last_seen DESC 
          LIMIT 10`, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// ============ PACKAGES ROUTES ============

// Get all packages
app.get('/api/packages', authenticateToken, (req, res) => {
  db.all(`SELECT p.*, 
          (SELECT COUNT(*) FROM users WHERE package_id = p.id AND status = 'active') as subscribers
          FROM packages p`, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// Get single package
app.get('/api/packages/:id', authenticateToken, (req, res) => {
  db.get('SELECT * FROM packages WHERE id = ?', [req.params.id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!row) {
      return res.status(404).json({ error: 'Package not found' });
    }
    res.json(row);
  });
});

// Create package
app.post('/api/packages', authenticateToken, (req, res) => {
  const { name, channels, duration, price } = req.body;
  
  db.run('INSERT INTO packages (name, channels, duration, price) VALUES (?, ?, ?, ?)',
    [name, channels, duration, price], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ id: this.lastID, name, channels, duration, price, status: 'active' });
    });
});

// Update package
app.put('/api/packages/:id', authenticateToken, (req, res) => {
  const { name, channels, duration, price, status } = req.body;
  
  db.run('UPDATE packages SET name = ?, channels = ?, duration = ?, price = ?, status = ? WHERE id = ?',
    [name, channels, duration, price, status, req.params.id], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Package not found' });
      }
      res.json({ message: 'Package updated successfully' });
    });
});

// Delete package
app.delete('/api/packages/:id', authenticateToken, (req, res) => {
  db.run('DELETE FROM packages WHERE id = ?', [req.params.id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Package not found' });
    }
    res.json({ message: 'Package deleted successfully' });
  });
});

// ============ USERS ROUTES ============

// Get all users
app.get('/api/users', authenticateToken, (req, res) => {
  db.all(`SELECT u.*, p.name as package_name 
          FROM users u 
          LEFT JOIN packages p ON u.package_id = p.id
          ORDER BY u.created_at DESC`, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// Create user
app.post('/api/users', authenticateToken, async (req, res) => {
  const { username, password, package_id, device } = req.body;
  
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Get package duration
    db.get('SELECT duration FROM packages WHERE id = ?', [package_id], (err, pkg) => {
      const expiryDate = new Date(Date.now() + (pkg.duration || 30) * 24 * 60 * 60 * 1000).toISOString();
      
      db.run(`INSERT INTO users (username, password, package_id, device, expiry_date) 
              VALUES (?, ?, ?, ?, ?)`,
        [username, hashedPassword, package_id, device, expiryDate], function(err) {
          if (err) {
            return res.status(500).json({ error: 'Database error' });
          }
          res.json({ id: this.lastID, username, package_id, device, status: 'active' });
        });
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user
app.put('/api/users/:id', authenticateToken, (req, res) => {
  const { package_id, status, device } = req.body;
  
  db.run('UPDATE users SET package_id = ?, status = ?, device = ? WHERE id = ?',
    [package_id, status, device, req.params.id], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ message: 'User updated successfully' });
    });
});

// Delete user
app.delete('/api/users/:id', authenticateToken, (req, res) => {
  db.run('DELETE FROM users WHERE id = ?', [req.params.id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ message: 'User deleted successfully' });
  });
});

// ============ CHANNELS ROUTES ============

// Get channels by package
app.get('/api/channels/:packageId', (req, res) => {
  db.all('SELECT * FROM channels WHERE package_id = ?', [req.params.packageId], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// Create channel
app.post('/api/channels', authenticateToken, (req, res) => {
  const { name, url, logo, category, package_id } = req.body;
  
  db.run('INSERT INTO channels (name, url, logo, category, package_id) VALUES (?, ?, ?, ?, ?)',
    [name, url, logo, category, package_id], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ id: this.lastID, name, url, logo, category, package_id });
    });
});

// Delete channel
app.delete('/api/channels/:id', authenticateToken, (req, res) => {
  db.run('DELETE FROM channels WHERE id = ?', [req.params.id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ message: 'Channel deleted successfully' });
  });
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 IPTV Panel Pro server running on http://0.0.0.0:${PORT}`);
  console.log(`📊 Dashboard: http://your-vps-ip:${PORT}`);
  console.log(`🔑 Default login - username: admin, password: admin123`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    }
    console.log('\n👋 Server shutting down...');
    process.exit(0);
  });
});
