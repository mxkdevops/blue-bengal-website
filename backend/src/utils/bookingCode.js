const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

function generateBookingCode() {
    let code = "BB-";
    for (let i = 0; i < 6; i++) {
        code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    return code;
}

module.exports = { generateBookingCode };
