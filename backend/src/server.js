require("dotenv").config();
const app = require("./app");
const { startReminderScheduler } = require("./jobs/reminderScheduler");

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Blue Bengal backend listening on http://localhost:${PORT}`);
    startReminderScheduler();
});
