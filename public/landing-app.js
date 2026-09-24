const createButton = document.getElementById("create");
const status = document.getElementById("status");
const result = document.getElementById("result");
const timezoneInput =
  document.getElementById(
    "timezone"
  );

TimezoneValidation.attachSuggestions(
  timezoneInput,
  document.getElementById(
    "timezoneOptions"
  )
);

const landingParams =
  new URLSearchParams(
    globalThis.location?.search || ""
  );

if (
  landingParams.get(
    "planner_deleted"
  ) === "1"
) {
  status.textContent =
    "Planner deleted permanently ✓";
  status.className =
    "save-status";

  history.replaceState(
    null,
    "",
    globalThis.location?.pathname || "/"
  );
}

timezoneInput.addEventListener("keydown", event => {
  if (event.key !== "Enter") return;

  event.preventDefault();
  createButton.click();
});

let calendarUrl = "";
let manageUrl = "";

async function copyText(value, button, normalLabel) {
  if (!value) return;

  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const area = document.createElement("textarea");
    area.value = value;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }

  button.textContent = "Copied ✓";

  setTimeout(() => {
    button.textContent = normalLabel;
  }, 1600);
}

createButton.addEventListener("click", async () => {
  const timezoneResult =
    TimezoneValidation.validateInput(
      timezoneInput,
      {
        report: true
      }
    );

  if (!timezoneResult.valid) {
    status.textContent =
      timezoneResult.message;
    status.className =
      "save-status error";
    timezoneInput.focus();
    return;
  }

  createButton.disabled = true;
  status.textContent = "Creating your private planner…";
  status.className = "save-status";

  try {
    const data =
      await JsonApiClient.fetchJson(
        "/api/create",
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            timezone:
              timezoneResult.timezone
          })
        },
        {
          serviceName:
            "Planner creation service"
        }
      );

    manageUrl = data.management_url;
    calendarUrl = data.calendar_url;

    document.getElementById("manageUrl").textContent = manageUrl;
    document.getElementById("calendarUrl").textContent = calendarUrl;
    document.getElementById("manageButton").href = manageUrl;

    result.classList.remove("hidden");
    status.textContent = "Created successfully ✓";

    result.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  } catch (error) {
    status.textContent = error.message;
    status.className = "save-status error";
  } finally {
    createButton.disabled = false;
  }
});

document
  .getElementById("copyCalendar")
  .addEventListener(
    "click",
    event =>
      copyText(
        calendarUrl,
        event.currentTarget,
        "Copy calendar URL"
      )
  );

document
  .getElementById("copyManage")
  .addEventListener(
    "click",
    event =>
      copyText(
        manageUrl,
        event.currentTarget,
        "Copy"
      )
  );
