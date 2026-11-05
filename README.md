## Lost & Found Item Finder

## Team
- Jonathon Kim - Scrum Master + Backend Assistance
- Alex Ceniza - Frontend + Integration Lead
- Richard Kainuku - Backend + Database Lead

## Technologies (as per the proposal)
- HTML
- CSS
- JavaScript
- Node.js
- Express
- MySQL
- Socket.IO
- Multer (Photo support if needed)

## Initial Setup
1. Clone the repository.
2. Run: npm install
3. Copy .env.example to .env
4. Update the database settings and SESSION_SECRET in .env
5. Run the SQL files inside db/sql in numerical order.
6. Start the application with: npm run dev
7. Open: http://localhost:3000

## Account Creation
1. Run node scripts/createModerator.js to create a simple moderator account for MVP
2. Follow terminal prompts to enter an email and password. This is your Moderator login.
Things to know about Accounts currently:
- Write down your password, recovery isn't supported yet.
- Mod emails can be found in the moderators table, and actions with mod ID in activity_logs to help identify who preformed them

## DB Name
lost_found_db
