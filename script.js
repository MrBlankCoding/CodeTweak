document.addEventListener("DOMContentLoaded", function () {
  // Initialize all animations and interactive elements
  initSmoothScrolling();
  initParallaxEffects();
  initTimelineAnimations();
  initFaqAccordion();
  initGlitchEffect();
  initScrollReveal();
  initTypingEffect();
  initDynamicBackground();
  initButtonHoverEffects();
});

// ===== SMOOTH SCROLLING =====
function initSmoothScrolling() {
  // Select all links with hashes
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault();

      const targetId = this.getAttribute("href");
      if (targetId === "#") return;

      const targetElement = document.querySelector(targetId);
      if (!targetElement) return;

      // Smooth scroll to target
      window.scrollTo({
        top: targetElement.offsetTop,
        behavior: "smooth",
      });
    });
  });
}

// ===== PARALLAX EFFECTS =====
function initParallaxEffects() {
  const heroSection = document.querySelector(".hero");
  const codeBackground = document.querySelector(".code-background");
  const heroContent = document.querySelector(".hero-content");

  // Parallax effect on hero section
  window.addEventListener("scroll", function () {
    const scrollPosition = window.scrollY;

    // Parallax for hero background
    if (codeBackground) {
      codeBackground.style.transform = `translateY(${scrollPosition * 0.3}px)`;
    }

    // Fade out hero content as user scrolls down
    if (heroContent && scrollPosition < heroSection.offsetHeight) {
      const opacity = 1 - scrollPosition / (heroSection.offsetHeight * 0.8);
      heroContent.style.opacity = Math.max(0.2, opacity);
      heroContent.style.transform = `translateY(${scrollPosition * 0.1}px)`;
    }

    // Parallax for feature cards
    document.querySelectorAll(".feature-card").forEach((card, index) => {
      const cardPosition = card.getBoundingClientRect().top;
      const screenPosition = window.innerHeight;

      if (cardPosition < screenPosition * 1.1) {
        card.style.transform = `translateY(${
          -5 + (scrollPosition - cardPosition) * 0.02
        }px)`;
      }
    });
  });
}

// ===== TIMELINE ANIMATIONS =====
function initTimelineAnimations() {
  // Calculate when timeline elements should animate
  const timelineObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animateTimelineStep(entry.target);
          timelineObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2 }
  );

  // Observe all timeline steps
  document.querySelectorAll(".step").forEach((step, index) => {
    // Add delay based on step index
    step.style.transitionDelay = `${index * 0.2}s`;
    timelineObserver.observe(step);
  });

  // Animate the timeline line as user scrolls
  const timelineSection = document.querySelector(".how-it-works");
  const timelineLine = document.querySelector(".timeline-line");

  if (timelineSection && timelineLine) {
    window.addEventListener("scroll", function () {
      const sectionTop = timelineSection.getBoundingClientRect().top;
      const sectionHeight = timelineSection.offsetHeight;
      const windowHeight = window.innerHeight;

      // Calculate how far we've scrolled through the section
      let scrollPercentage = 0;
      if (sectionTop < windowHeight && sectionTop > -sectionHeight) {
        scrollPercentage = Math.min(
          100,
          (windowHeight - sectionTop) / ((sectionHeight + windowHeight) / 100)
        );
      } else if (sectionTop <= -sectionHeight) {
        scrollPercentage = 100;
      }

      timelineLine.style.height = `${scrollPercentage}%`;
    });
  }
}

function animateTimelineStep(step) {
  step.classList.add("animated");

  // Animate step number
  const stepNumber = step.querySelector(".step-number");
  if (stepNumber) {
    stepNumber.style.transform = "scale(1.2)";
    setTimeout(() => {
      stepNumber.style.transform = "scale(1)";
    }, 300);
  }

  // Animate step content
  const stepContent = step.querySelector(".step-content");
  if (stepContent) {
    stepContent.style.opacity = "0";
    stepContent.style.transform = "translateX(20px)";
    setTimeout(() => {
      stepContent.style.opacity = "1";
      stepContent.style.transform = "translateX(0)";
    }, 200);
  }
}

// ===== FAQ ACCORDION =====
function initFaqAccordion() {
  const accordionItems = document.querySelectorAll(".accordion-item");

  accordionItems.forEach((item) => {
    const header = item.querySelector(".accordion-header");

    header.addEventListener("click", () => {
      // Toggle active class on clicked item
      const isActive = item.classList.contains("active");

      // Close all accordion items first
      accordionItems.forEach((accordionItem) => {
        accordionItem.classList.remove("active");
        const content = accordionItem.querySelector(".accordion-content");
        content.style.maxHeight = null;
      });

      // If the clicked item wasn't active, open it
      if (!isActive) {
        item.classList.add("active");
        const content = item.querySelector(".accordion-content");
        content.style.maxHeight = content.scrollHeight + "px";

        // Add animation to content
        content.style.opacity = "0";
        setTimeout(() => {
          content.style.opacity = "1";
        }, 300);
      }
    });
  });

  // Open first accordion item by default
  if (accordionItems.length > 0) {
    accordionItems[0].classList.add("active");
    const firstContent = accordionItems[0].querySelector(".accordion-content");
    if (firstContent) {
      firstContent.style.maxHeight = firstContent.scrollHeight + "px";
    }
  }
}

// ===== GLITCH EFFECT =====
function initGlitchEffect() {
  const glitchElement = document.querySelector(".glitch");

  if (glitchElement) {
    // Add more random glitch moments
    setInterval(() => {
      glitchElement.classList.add("glitch-active");
      setTimeout(() => {
        glitchElement.classList.remove("glitch-active");
      }, 200);
    }, 3000);

    // Add more intense glitch on hover
    glitchElement.addEventListener("mouseenter", () => {
      glitchElement.classList.add("glitch-hover");
    });

    glitchElement.addEventListener("mouseleave", () => {
      glitchElement.classList.remove("glitch-hover");
    });
  }
}

// ===== SCROLL REVEAL ANIMATIONS =====
function initScrollReveal() {
  const observerOptions = {
    threshold: 0.15,
    rootMargin: "0px 0px -50px 0px",
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("revealed");
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // Observe elements with data-aos attribute
  document.querySelectorAll("[data-aos]").forEach((element) => {
    element.style.opacity = "0";
    element.style.transform = "translateY(30px)";
    element.style.transition = "opacity 0.8s ease, transform 0.8s ease";
    observer.observe(element);
  });

  // Add revealed class to make elements visible with animation
  document.addEventListener(
    "scroll",
    () => {
      document.querySelectorAll(".revealed").forEach((element) => {
        element.style.opacity = "1";
        element.style.transform = "translateY(0)";
      });
    },
    { passive: true }
  );
}

// ===== TYPING EFFECT =====
function initTypingEffect() {
  const heroSubtitle = document.querySelector(".hero-content p");

  if (heroSubtitle) {
    const originalText = heroSubtitle.textContent;
    heroSubtitle.textContent = "";

    let charIndex = 0;

    // Only start typing when hero section is visible
    const startTyping = () => {
      if (charIndex < originalText.length) {
        heroSubtitle.textContent += originalText.charAt(charIndex);
        charIndex++;
        setTimeout(startTyping, 40);
      } else {
        // Add blinking cursor at the end
        heroSubtitle.innerHTML += '<span class="cursor">|</span>';
        animateCursor();
      }
    };

    // Add blinking cursor animation
    const animateCursor = () => {
      const cursor = document.querySelector(".cursor");
      if (cursor) {
        setInterval(() => {
          cursor.style.opacity = cursor.style.opacity === "0" ? "1" : "0";
        }, 500);
      }
    };

    // Start typing animation with slight delay after page load
    setTimeout(startTyping, 500);
  }
}

// ===== DYNAMIC BACKGROUND =====
function initDynamicBackground() {
  const codeBackground = document.querySelector(".code-background");

  if (codeBackground) {
    // Create floating code snippets
    const snippets = [
      "{ code }",
      "function()",
      "<script>",
      "addEventListener",
      "=> {}",
      ".querySelector",
      "import",
      "export",
      "async/await",
      "new Promise",
      "document.write",
      "window.location",
    ];

    // Create 20 random code snippets for background
    for (let i = 0; i < 20; i++) {
      const snippet = document.createElement("div");
      snippet.className = "floating-code";
      snippet.textContent =
        snippets[Math.floor(Math.random() * snippets.length)];

      // Randomize position and animation duration
      snippet.style.left = `${Math.random() * 100}%`;
      snippet.style.top = `${Math.random() * 100}%`;
      snippet.style.animationDuration = `${15 + Math.random() * 25}s`;
      snippet.style.opacity = `${0.03 + Math.random() * 0.07}`;
      snippet.style.transform = `rotate(${Math.random() * 360}deg)`;

      codeBackground.appendChild(snippet);
    }

    // Add mouse parallax effect to the background
    document.addEventListener("mousemove", (e) => {
      const mouseX = e.clientX / window.innerWidth;
      const mouseY = e.clientY / window.innerHeight;

      document.querySelectorAll(".floating-code").forEach((snippet) => {
        const moveX = (mouseX - 0.5) * 40;
        const moveY = (mouseY - 0.5) * 40;
        snippet.style.transform = `translate(${moveX * Math.random()}px, ${
          moveY * Math.random()
        }px) rotate(${Math.random() * 360}deg)`;
      });
    });
  }
}

// ===== BUTTON HOVER EFFECTS =====
function initButtonHoverEffects() {
  // Add magnetic effect to CTA buttons
  document.querySelectorAll(".cta-button").forEach((button) => {
    button.addEventListener("mousemove", (e) => {
      const buttonRect = button.getBoundingClientRect();
      const buttonX = buttonRect.left + buttonRect.width / 2;
      const buttonY = buttonRect.top + buttonRect.height / 2;

      const distanceX = e.clientX - buttonX;
      const distanceY = e.clientY - buttonY;

      // Calculate distance from center
      const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);

      // Apply magnetic effect (stronger when closer to button)
      if (distance < 100) {
        const strength = 10;
        button.style.transform = `translate(${distanceX / strength}px, ${
          distanceY / strength
        }px) scale(1.05)`;
      } else {
        button.style.transform = "translate(0, 0) scale(1)";
      }
    });

    button.addEventListener("mouseleave", () => {
      button.style.transform = "translate(0, 0) scale(1)";
    });
  });

  // Add glow effect to feature cards
  document.querySelectorAll(".feature-card").forEach((card) => {
    card.addEventListener("mousemove", (e) => {
      const cardRect = card.getBoundingClientRect();
      const x = e.clientX - cardRect.left;
      const y = e.clientY - cardRect.top;

      // Calculate the position for the glow effect
      const glowX = (x / cardRect.width) * 100;
      const glowY = (y / cardRect.height) * 100;

      // Apply radial gradient glow effect
      card.style.background = `radial-gradient(circle at ${glowX}% ${glowY}%, rgba(187, 134, 252, 0.08) 0%, var(--bg-card) 60%)`;
    });

    card.addEventListener("mouseleave", () => {
      card.style.background = "var(--bg-card)";
    });
  });
}

// Add CSS styles for new animation elements
function addDynamicStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .floating-code {
      position: absolute;
      font-family: 'Fira Code', monospace;
      font-size: 1rem;
      color: var(--primary-light);
      pointer-events: none;
      animation: float linear infinite;
    }
    
    @keyframes float {
      0% { transform: translateY(0) rotate(0deg); }
      100% { transform: translateY(-100vh) rotate(360deg); }
    }
    
    .glitch-active::before,
    .glitch-active::after {
      animation-duration: 0.2s !important;
      animation-timing-function: steps(2, end) !important;
    }
    
    .glitch-hover::before,
    .glitch-hover::after {
      clip: rect(auto, auto, auto, auto) !important;
      animation-duration: 0.1s !important;
      animation-timing-function: steps(2, end) !important;
      opacity: 0.8;
    }
    
    .cursor {
      display: inline-block;
      width: 2px;
      margin-left: 2px;
      transition: opacity 0.2s;
    }
    
    .step {
      opacity: 0;
      transform: translateY(30px);
      transition: opacity 0.8s ease, transform 0.8s ease;
    }
    
    .step.animated {
      opacity: 1;
      transform: translateY(0);
    }
    
    .step-content {
      transition: opacity 0.5s ease, transform 0.5s ease;
    }
    
    .step-number {
      transition: transform 0.3s ease;
    }
    
    .revealed {
      opacity: 1 !important;
      transform: translateY(0) !important;
    }
    
    .timeline-line {
      transition: height 0.5s ease-out;
    }
    
    .accordion-content {
      transition: max-height 0.5s ease, opacity 0.3s ease;
    }
  `;

  document.head.appendChild(style);
}

// Call to add dynamic styles
addDynamicStyles();

// Initialize navigation highlight
function initNavHighlight() {
  const sections = document.querySelectorAll("section[id]");

  window.addEventListener("scroll", () => {
    let current = "";
    sections.forEach((section) => {
      const sectionTop = section.offsetTop;
      const sectionHeight = section.clientHeight;
      if (pageYOffset >= sectionTop - sectionHeight / 3) {
        current = section.getAttribute("id");
      }
    });

    document.querySelectorAll("nav a").forEach((a) => {
      a.classList.remove("active");
      if (a.getAttribute("href").slice(1) === current) {
        a.classList.add("active");
      }
    });
  });
}

// When the page loads, check if any hash in URL and scroll to it smoothly
window.addEventListener("load", () => {
  if (window.location.hash) {
    const targetElement = document.querySelector(window.location.hash);
    if (targetElement) {
      setTimeout(() => {
        window.scrollTo({
          top: targetElement.offsetTop,
          behavior: "smooth",
        });
      }, 100);
    }
  }

  // Add counter animation to stats (if present)
  document.querySelectorAll(".stat-number").forEach((stat) => {
    const targetNumber = parseInt(stat.textContent);
    animateCounter(stat, 0, targetNumber, 2000);
  });
});

// Counter animation function
function animateCounter(element, start, end, duration) {
  const range = end - start;
  const startTime = performance.now();

  const updateCounter = (timestamp) => {
    const elapsedTime = timestamp - startTime;

    if (elapsedTime < duration) {
      const progress = elapsedTime / duration;
      const currentValue = Math.floor(start + progress * range);
      element.textContent = currentValue;
      requestAnimationFrame(updateCounter);
    } else {
      element.textContent = end;
    }
  };

  requestAnimationFrame(updateCounter);
}
