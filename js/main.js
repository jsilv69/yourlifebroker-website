/* =================================================================
   Tomorrow Life — Interactions
   ================================================================= */
(function () {
  "use strict";

  /* ---- Header shadow on scroll ---- */
  const header = document.getElementById("header");
  const onScroll = () => header.classList.toggle("is-stuck", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---- Mobile menu ---- */
  const toggle = document.getElementById("navToggle");
  const menu = document.getElementById("mobileMenu");
  if (toggle && menu) {
    const setMenu = (open) => {
      toggle.setAttribute("aria-expanded", String(open));
      menu.classList.toggle("is-open", open);
      menu.hidden = !open;
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    };
    toggle.addEventListener("click", () =>
      setMenu(toggle.getAttribute("aria-expanded") !== "true")
    );
    menu.querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", () => setMenu(false))
    );
  }

  /* ---- Mobile "Plans" submenu ---- */
  const plansToggle = document.getElementById("mobilePlansToggle");
  const plansList = document.getElementById("mobilePlansList");
  if (plansToggle && plansList) {
    plansToggle.addEventListener("click", () => {
      const open = plansToggle.getAttribute("aria-expanded") === "true";
      plansToggle.setAttribute("aria-expanded", String(!open));
      plansList.classList.toggle("is-open", !open);
    });
  }

  /* ---- Populate state dropdown ---- */
  const states = ["Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming"];
  const stateSel = document.getElementById("state");
  if (stateSel) {
    const frag = document.createDocumentFragment();
    states.forEach((s) => {
      const o = document.createElement("option");
      o.textContent = s;
      frag.appendChild(o);
    });
    stateSel.appendChild(frag);
  }

  /* ---- Scroll reveal ---- */
  const reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("is-visible"));
  }

  /* ---- Animated stat counters ---- */
  const counters = document.querySelectorAll(".stat__num[data-count]");
  const animate = (el) => {
    const target = parseFloat(el.dataset.count);
    const prefix = el.dataset.prefix || "";
    const suffix = el.dataset.suffix || "";
    const dur = 1600;
    let start = null;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const val = Math.round(target * eased);
      el.textContent = prefix + val.toLocaleString() + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  if ("IntersectionObserver" in window && counters.length) {
    const cio = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            animate(e.target);
            cio.unobserve(e.target);
          }
        });
      },
      { threshold: 0.5 }
    );
    counters.forEach((c) => cio.observe(c));
  }

  /* ---- FAQ: single-open accordion ---- */
  const faqItems = document.querySelectorAll(".faq-item");
  faqItems.forEach((item) => {
    item.addEventListener("toggle", () => {
      if (item.open) {
        faqItems.forEach((other) => {
          if (other !== item) other.open = false;
        });
      }
    });
  });

  /* ---- Phone input formatting ---- */
  const phone = document.getElementById("phone");
  if (phone) {
    phone.addEventListener("input", () => {
      const d = phone.value.replace(/\D/g, "").slice(0, 10);
      let out = d;
      if (d.length > 6) out = `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
      else if (d.length > 3) out = `(${d.slice(0, 3)}) ${d.slice(3)}`;
      else if (d.length > 0) out = `(${d}`;
      phone.value = out;
    });
  }

  /* ---- Quiz quote form ---- */
  const form = document.getElementById("quoteForm");
  const success = document.getElementById("formSuccess");
  if (form && form.classList.contains("quiz")) {
    const steps = Array.from(form.querySelectorAll(".quiz-step"));
    const total = steps.length;
    const bar = document.getElementById("quizBar");
    const curLabel = document.getElementById("quizCur");
    const totalLabel = document.getElementById("quizTotal");
    const backBtn = document.getElementById("quizBack");
    const nextBtn = document.getElementById("quizNext");
    const submitBtn = document.getElementById("quizSubmit");
    const autoSteps = new Set(); // 1-based step numbers that auto-advance
    let current = 1;

    if (totalLabel) totalLabel.textContent = String(total);
    steps.forEach((s, i) => {
      if (s.querySelector("[data-autoadvance]")) autoSteps.add(i + 1);
    });

    const stepEl = (n) => steps[n - 1];

    const validateStep = (n) => {
      const fields = stepEl(n).querySelectorAll("input, select, textarea");
      for (const f of fields) {
        if (!f.checkValidity()) {
          f.reportValidity();
          return false;
        }
      }
      return true;
    };

    const render = (focusStep) => {
      steps.forEach((s, i) => s.classList.toggle("is-active", i + 1 === current));
      if (bar) bar.style.width = (current / total) * 100 + "%";
      if (curLabel) curLabel.textContent = String(current);
      const isLast = current === total;
      backBtn.hidden = current === 1;
      submitBtn.hidden = !isLast;
      nextBtn.hidden = isLast || autoSteps.has(current);
      if (focusStep) {
        const firstControl = stepEl(current).querySelector("input:not([type=radio]), select, input[type=radio]");
        if (firstControl) {
          try { firstControl.focus({ preventScroll: true }); } catch (e) {}
        }
      }
    };

    const goTo = (n) => {
      current = Math.min(Math.max(n, 1), total);
      render(true);
      // keep the form comfortably in view when advancing
      const top = form.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top, behavior: "smooth" });
    };

    const next = () => { if (validateStep(current)) goTo(current + 1); };

    nextBtn.addEventListener("click", next);
    backBtn.addEventListener("click", () => goTo(current - 1));

    // auto-advance on selecting a card in an auto-advance step
    form.querySelectorAll("[data-autoadvance] input").forEach((input) => {
      input.addEventListener("change", () => {
        if (current === total) return;
        setTimeout(() => { if (validateStep(current)) goTo(current + 1); }, 320);
      });
    });

    // Enter advances instead of submitting (except on the last step)
    form.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && current !== total && e.target.tagName !== "TEXTAREA") {
        e.preventDefault();
        next();
      }
    });

    const errorEl = document.getElementById("quizError");
    const showError = (msg) => {
      if (!errorEl) return;
      errorEl.textContent = msg;
      errorEl.hidden = false;
    };

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (errorEl) errorEl.hidden = true;

      if (!form.checkValidity()) {
        // jump to the first step containing an invalid field
        const firstInvalid = form.querySelector(":invalid");
        if (firstInvalid) {
          const owner = firstInvalid.closest(".quiz-step");
          const idx = steps.indexOf(owner);
          if (idx > -1) goTo(idx + 1);
          firstInvalid.reportValidity();
        }
        return;
      }

      // Collect answers
      const payload = Object.fromEntries(new FormData(form).entries());

      const label = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting…";

      try {
        const resp = await fetch("/api/lead", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data.ok) {
          throw new Error(data.error || "Something went wrong. Please try again.");
        }
        if (success) {
          success.hidden = false;
          success.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = label;
        showError(
          (err && err.message ? err.message : "We couldn't submit your request.") +
            " You can also call us at (810) 512-7397."
        );
      }
    });

    render();
  } else if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      if (success) { success.hidden = false; success.scrollIntoView({ behavior: "smooth", block: "center" }); }
    });
  }

  /* ---- Footer year (safety) ---- */
  document.querySelectorAll("[data-year]").forEach((el) => {
    el.textContent = new Date().getFullYear();
  });
})();
