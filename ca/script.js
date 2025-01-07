// script.js

// Wait for the DOM to load
document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("ca-form");
    const ruleInput = document.getElementById("rule-input");
    const stepsInput = document.getElementById("steps-input");
    const caCanvas = document.getElementById("ca-canvas");
    const downloadBtn = document.getElementById("download-btn");
  
    // Handle form submission
    form.addEventListener("submit", (event) => {
      event.preventDefault(); // Prevent page reload
  
      const ruleNumber = parseInt(ruleInput.value, 10);
      const steps = parseInt(stepsInput.value, 10);
  
      // Basic validation
      if (ruleNumber < 1 || ruleNumber > 256) return;
      if (steps < 1 || steps > 10000) return;
  
      // Generate the CA and draw on the canvas
      generateCA(ruleNumber, steps, caCanvas);
  
      // Show the download button
      downloadBtn.style.display = "inline-block";
    });
  
    // Download the canvas as a PNG
    downloadBtn.addEventListener("click", () => {
      const imageData = caCanvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = imageData;
      link.download = `ca_rule${ruleInput.value}_steps${stepsInput.value}.png`;
      link.click();
    });
  });
  
  /**
   * Generates and draws the ECA (elementary cellular automaton).
   * 
   * @param {number} rule - ECA rule number (0-255).
   * @param {number} steps - Number of rows (steps) to compute.
   * @param {HTMLCanvasElement} canvas - The canvas to draw on.
   */
  function generateCA(rule, steps, canvas) {
    // We’ll keep the width = some safe number of cells, e.g. 2*steps + 1 to avoid cutoffs
    const width = 2 * steps + 1;
    const height = steps;
  
    // Set canvas size
    canvas.width = width;
    canvas.height = height;
  
    // Get the drawing context
    const ctx = canvas.getContext("2d");
  
    // Clear the canvas (set alpha to 0)
    ctx.clearRect(0, 0, width, height);
  
    // Convert rule into an 8-bit array (index 0 => least significant bit)
    // For a rule like 110 => binary '01101110'
    const ruleBits = [];
    for (let b = 0; b < 8; b++) {
      ruleBits[b] = (rule >> b) & 1;
    }
  
    // Initialize a 1D array with a single "1" in the middle
    let currentRow = new Array(width).fill(0);
    currentRow[Math.floor(width / 2)] = 1;
  
    // For each step, draw the row, then compute the next row
    for (let row = 0; row < height; row++) {
      // Draw the row
      drawRow(ctx, currentRow, row);
  
      // Compute the next row
      currentRow = getNextRow(currentRow, ruleBits);
    }
  }
  
  /**
   * Computes the next row of cells given the current row and the ECA rule bits.
   */
  function getNextRow(row, ruleBits) {
    const newRow = new Array(row.length);
    for (let i = 0; i < row.length; i++) {
      // For each cell, get left, center, right
      const left   = row[(i - 1 + row.length) % row.length];
      const center = row[i];
      const right  = row[(i + 1) % row.length];
  
      // Neighborhood index, e.g. for (left, center, right) = (1,1,0)
      // index = 4*1 + 2*1 + 1*0 = 6
      const index = (left << 2) | (center << 1) | right;
  
      // new cell = ruleBits[index]
      newRow[i] = ruleBits[index];
    }
    return newRow;
  }
  
  /**
   * Draws a single row onto the canvas.
   * 
   * Black pixel => cell = 1
   * Transparent => cell = 0
   */
  function drawRow(ctx, row, rowIndex) {
    // For each cell in the row
    for (let col = 0; col < row.length; col++) {
      if (row[col] === 1) {
        // Draw a single black pixel
        ctx.fillStyle = "black";
        ctx.fillRect(col, rowIndex, 1, 1);
      }
      // If row[col] === 0, we simply don't draw (transparent)
    }
  }
  