document.addEventListener("DOMContentLoaded", function () {
    const buttons = document.querySelectorAll('.button');
    
    // Adding a simple hover effect using JavaScript for buttons
    buttons.forEach(button => {
      button.addEventListener('mouseover', () => {
        button.style.backgroundColor = '#d49d37';
      });
      
      button.addEventListener('mouseout', () => {
        button.style.backgroundColor = '#fcbf49';
      });
    });
  });
  