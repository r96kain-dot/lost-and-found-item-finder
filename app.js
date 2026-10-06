require("dotenv").config();

const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
    res.send("Lost & Found Item Finder is running.");
});

app.listen(PORT, () => {
    console.log("Server running on http://localhost:" + PORT);
});
