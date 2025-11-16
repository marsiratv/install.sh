#!/bin/bash

# IPTV Panel Pro - Installation Script for Ubuntu 22
# Run this script with: sudo bash install.sh

set -e

echo "=================================================="
echo "   IPTV Panel Pro - Auto Installation Script"
echo "   Ubuntu 22.04 LTS"
echo "=================================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo "❌ Please run as root or with sudo"
  exit 1
fi

# Get server IP
SERVER_IP=$(curl -s ifconfig.me || hostname -I | awk '{print $1}')
echo "🌐 Your server IP: $SERVER_IP"
echo ""

# Update system
echo "📦 Updating system packages..."
apt update && apt upgrade -y

# Install Node.js 18.x
echo "📦 Installing Node.js 18.x..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# Install build essentials
echo "📦 Installing build tools..."
apt install -y build-essential git nginx

# Verify installation
echo "✅ Node.js version: $(node -v)"
echo "✅ NPM version: $(npm -v)"

# Create application directory
APP_DIR="/var/www/iptv-panel"
echo "📁 Creating application directory at $APP_DIR"
mkdir -p $APP_DIR
cd $APP_DIR

# Create package.json
echo "📝 Creating package.json..."
cat > package.json << 'EOF'
{
  "name": "iptv-panel-pro",
  "version": "1.0.0",
  "description": "IPTV Panel Pro - Complete Management System",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "keywords": ["iptv", "panel", "management"],
  "author": "IPTV Panel Pro",
  "license": "MIT",
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "sqlite3": "^5.1.6",
    "bcrypt": "^5.1.1",
    "jsonwebtoken": "^9.0.2",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
EOF

# Create .env file
echo "🔐 Creating environment configuration..."
cat > .env << EOF
PORT=3001
JWT_SECRET=$(openssl rand -base64 32)
NODE_ENV=production
EOF

# Install npm packages
echo "📦 Installing npm dependencies..."
npm install

# Create server.js (copy from previous artifact)
echo "📝 Creating server.js..."
cat > server.js << 'SERVEREOF'
// Place the complete server.js code here
// (Copy from the previous Backend Server artifact)
SERVEREOF

# Create public directory
echo "📁 Creating public directory..."
mkdir -p public

# Create index.html with embedded React app
echo "📝 Creating frontend..."
cat > public/index.html << 'HTMLEOF'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IPTV Panel Pro</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  
  <script type="text/babel">
    // Place the complete React component code here
    // (Copy from the first React artifact)
    
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(<IPTVPanelPro />);
  </script>
</body>
</html>
HTMLEOF

# Create systemd service
echo "⚙️  Creating systemd service..."
cat > /etc/systemd/system/iptv-panel.service << EOF
[Unit]
Description=IPTV Panel Pro
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Configure Nginx
echo "🌐 Configuring Nginx..."
cat > /etc/nginx/sites-available/iptv-panel << EOF
server {
    listen 80;
    server_name $SERVER_IP;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# Enable Nginx site
ln -sf /etc/nginx/sites-available/iptv-panel /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
echo "🔍 Testing Nginx configuration..."
nginx -t

# Configure firewall
echo "🔥 Configuring firewall..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
echo "y" | ufw enable

# Reload systemd and start services
echo "🚀 Starting services..."
systemctl daemon-reload
systemctl enable iptv-panel
systemctl start iptv-panel
systemctl restart nginx

# Wait for service to start
sleep 3

# Check service status
if systemctl is-active --quiet iptv-panel; then
    echo ""
    echo "=================================================="
    echo "   ✅ Installation completed successfully!"
    echo "=================================================="
    echo ""
    echo "📊 Access your IPTV Panel:"
    echo "   URL: http://$SERVER_IP"
    echo ""
    echo "🔑 Default login credentials:"
    echo "   Username: admin"
    echo "   Password: admin123"
    echo ""
    echo "📝 Useful commands:"
    echo "   View logs:    journalctl -u iptv-panel -f"
    echo "   Restart:      systemctl restart iptv-panel"
    echo "   Stop:         systemctl stop iptv-panel"
    echo "   Status:       systemctl status iptv-panel"
    echo ""
    echo "📂 Application location: $APP_DIR"
    echo "📊 Database location: $APP_DIR/iptv_panel.db"
    echo ""
    echo "⚠️  IMPORTANT: Change default password immediately!"
    echo "=================================================="
else
    echo ""
    echo "❌ Service failed to start. Check logs:"
    echo "   journalctl -u iptv-panel -n 50"
fi
