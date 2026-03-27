const btn = document.querySelector("#darkModeBtn");

btn.addEventListener("click", function () {
    document.body.classList.toggle("darkMode");

    if (document.body.classList.contains("darkMode")) {
        btn.textContent = "Light Mode";
    } else {
        btn.textContent = "Dark Mode";
    }
});
