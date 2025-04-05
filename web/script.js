// Wait for the DOM to be fully loaded
document.addEventListener("DOMContentLoaded", function () {
  // ===== NAVBAR HANDLING =====
  // We'll implement this for when scroll position changes
  const heroSection = document.getElementById("hero");
  let lastScrollPosition = 0;

  window.addEventListener("scroll", function () {
    const currentScrollPosition = window.scrollY;
    const scrollingDown = currentScrollPosition > lastScrollPosition;

    // Add animations based on scroll position
    const sections = document.querySelectorAll("section");
    sections.forEach((section) => {
      const sectionTop = section.getBoundingClientRect().top;
      const sectionBottom = section.getBoundingClientRect().bottom;
      const windowHeight = window.innerHeight;

      if (sectionTop < windowHeight * 0.75 && sectionBottom > 0) {
        section.classList.add("in-view");

        // Animate elements with data-aos attributes when they come into view
        const animatedElements = section.querySelectorAll("[data-aos]");
        animatedElements.forEach((el) => {
          const delay = el.getAttribute("data-aos-delay") || 0;
          setTimeout(() => {
            el.classList.add("aos-animate");
          }, delay);
        });
      }
    });

    lastScrollPosition = currentScrollPosition;
  });

  // Trigger scroll event once to check initial positions
  window.dispatchEvent(new Event("scroll"));

  // ===== FEATURE CARDS HOVER EFFECTS =====
  const featureCards = document.querySelectorAll(".feature-card");
  featureCards.forEach((card) => {
    card.addEventListener("mouseenter", function () {
      this.querySelector(".card-flourish").style.opacity = "1";
      this.querySelector(".feature-icon").classList.add("icon-active");
    });

    card.addEventListener("mouseleave", function () {
      this.querySelector(".card-flourish").style.opacity = "0";
      this.querySelector(".feature-icon").classList.remove("icon-active");
    });
  });

  // ===== CTA BUTTON GLOW EFFECT =====
  const ctaButtons = document.querySelectorAll(".cta-button");
  ctaButtons.forEach((button) => {
    button.addEventListener("mouseenter", function () {
      this.querySelector(".button-glow").style.opacity = "0.6";
    });

    button.addEventListener("mouseleave", function () {
      this.querySelector(".button-glow").style.opacity = "0";
    });
  });

  // ===== CAROUSEL FUNCTIONALITY =====
  const carousel = document.getElementById("preview-carousel");
  if (carousel) {
    const items = carousel.querySelectorAll(".carousel-item");
    const indicators = carousel.querySelectorAll(".indicator");
    let currentIndex = 0;
    const autoPlayInterval = 5000; // 5 seconds
    let autoPlayTimer;

    function updateCarousel() {
      // Remove active class from all items and indicators
      items.forEach((item) => item.classList.remove("active"));
      indicators.forEach((indicator) => indicator.classList.remove("active"));

      // Add active class to current item and indicator
      items[currentIndex].classList.add("active");
      indicators[currentIndex].classList.add("active");
    }

    function nextSlide() {
      currentIndex = (currentIndex + 1) % items.length;
      updateCarousel();
    }

    function prevSlide() {
      currentIndex = (currentIndex - 1 + items.length) % items.length;
      updateCarousel();
    }

    function startAutoPlay() {
      stopAutoPlay();
      autoPlayTimer = setInterval(nextSlide, autoPlayInterval);
    }

    function stopAutoPlay() {
      if (autoPlayTimer) {
        clearInterval(autoPlayTimer);
      }
    }

    // Add click event listeners to indicators
    indicators.forEach((indicator, index) => {
      indicator.addEventListener("click", function () {
        currentIndex = index;
        updateCarousel();
        stopAutoPlay();
        startAutoPlay();
      });
    });

    // Add touch/swipe functionality
    let touchStartX = 0;
    let touchEndX = 0;

    carousel.addEventListener(
      "touchstart",
      function (e) {
        touchStartX = e.changedTouches[0].screenX;
        stopAutoPlay();
      },
      { passive: true }
    );

    carousel.addEventListener(
      "touchend",
      function (e) {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
        startAutoPlay();
      },
      { passive: true }
    );

    function handleSwipe() {
      const swipeThreshold = 50;
      if (touchEndX < touchStartX - swipeThreshold) {
        nextSlide(); // Swipe left, go to next
      } else if (touchEndX > touchStartX + swipeThreshold) {
        prevSlide(); // Swipe right, go to previous
      }
    }

    // Add mouse hover pause
    carousel.addEventListener("mouseenter", stopAutoPlay);
    carousel.addEventListener("mouseleave", startAutoPlay);

    // Start the carousel
    startAutoPlay();
  }

  // ===== ACCORDION FUNCTIONALITY =====
  const accordionItems = document.querySelectorAll(".accordion-item");
  accordionItems.forEach((item) => {
    const header = item.querySelector(".accordion-header");
    const content = item.querySelector(".accordion-content");

    header.addEventListener("click", function () {
      // Check if this item is already active
      const isActive = item.classList.contains("active");

      // Close all accordion items
      accordionItems.forEach((accItem) => {
        accItem.classList.remove("active");
        accItem.querySelector(".accordion-content").style.maxHeight = null;
      });

      // If the clicked item wasn't active, open it
      if (!isActive) {
        item.classList.add("active");
        content.style.maxHeight = content.scrollHeight + "px";
      }
    });
  });

  // ===== SMOOTH SCROLLING FOR INTERNAL LINKS =====
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault();

      const targetId = this.getAttribute("href");
      if (targetId === "#") return;

      const targetElement = document.querySelector(targetId);
      if (targetElement) {
        // Smooth scroll to element
        window.scrollTo({
          top: targetElement.offsetTop,
          behavior: "smooth",
        });
      }
    });
  });

  // ===== GLITCH EFFECT ANIMATION =====
  const glitchElements = document.querySelectorAll(".glitch");
  glitchElements.forEach((element) => {
    // Random glitch effect trigger
    setInterval(() => {
      element.classList.add("glitching");
      setTimeout(() => {
        element.classList.remove("glitching");
      }, 200);
    }, 5000 + Math.random() * 5000); // Random interval between 5-10s
  });

  // ===== CODE TYPING ANIMATION =====
  const codeElements = document.querySelectorAll(".editor-code pre");
  codeElements.forEach((codeElement) => {
    const originalContent = codeElement.innerHTML;
    const contentLength = originalContent.length;

    // Only animate when the element is in view
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Element is in view, animate typing
            animateTyping(codeElement, originalContent);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );

    observer.observe(codeElement);
  });

  function animateTyping(element, text) {
    element.innerHTML = "";
    let index = 0;

    function typeNextChar() {
      if (index < text.length) {
        element.innerHTML += text.charAt(index);
        index++;
        setTimeout(typeNextChar, 5); // Fast typing speed
      }
    }

    typeNextChar();
  }

  // ===== TIMELINE ANIMATION =====
  const timelineSteps = document.querySelectorAll(".step");
  let timelineAnimationTriggered = false;

  window.addEventListener("scroll", function () {
    const timelineSection = document.querySelector(".how-it-works");
    if (!timelineSection) return;

    const sectionTop = timelineSection.getBoundingClientRect().top;
    const windowHeight = window.innerHeight;

    if (sectionTop < windowHeight * 0.7 && !timelineAnimationTriggered) {
      timelineAnimationTriggered = true;

      timelineSteps.forEach((step, index) => {
        setTimeout(() => {
          step.classList.add("animate-step");
        }, index * 300); // Stagger animation
      });
    }
  });

  // ===== INITIALIZE AOS ANIMATION CLASSES =====
  const aosElements = document.querySelectorAll("[data-aos]");
  aosElements.forEach((element) => {
    element.classList.add("aos-init");
  });

  // ===== CURSOR EFFECTS FOR CODE AREAS =====
  const codeAreas = document.querySelectorAll(".editor-code, .code-container");
  codeAreas.forEach((area) => {
    area.addEventListener("mousemove", function (e) {
      const rect = this.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Add a subtle glow effect where the mouse is
      this.style.setProperty("--cursor-x", `${x}px`);
      this.style.setProperty("--cursor-y", `${y}px`);
      this.classList.add("code-hover-effect");
    });

    area.addEventListener("mouseleave", function () {
      this.classList.remove("code-hover-effect");
    });
  });

  // ===== COMMUNITY STATS COUNTER ANIMATION =====
  const stats = document.querySelectorAll(".stat-number");
  let statsAnimationTriggered = false;

  function animateStats() {
    stats.forEach((stat) => {
      const targetValue = parseInt(stat.textContent);
      let currentValue = 0;
      const duration = 2000; // Animation duration in ms
      const step = targetValue / (duration / 16); // 60fps approx.

      function updateCounter() {
        currentValue += step;
        if (currentValue < targetValue) {
          stat.textContent =
            Math.ceil(currentValue) +
            (stat.textContent.includes("+") ? "+" : "");
          requestAnimationFrame(updateCounter);
        } else {
          stat.textContent =
            targetValue + (stat.textContent.includes("+") ? "+" : "");
        }
      }

      updateCounter();
    });
  }

  window.addEventListener("scroll", function () {
    const statsSection = document.querySelector(".community-stats");
    if (!statsSection) return;

    const sectionTop = statsSection.getBoundingClientRect().top;
    const windowHeight = window.innerHeight;

    if (sectionTop < windowHeight * 0.8 && !statsAnimationTriggered) {
      statsAnimationTriggered = true;
      animateStats();
    }
  });

  // ===== PARALLAX EFFECT =====
  window.addEventListener("scroll", function () {
    const scrollY = window.scrollY;

    // Apply parallax to background elements
    document.querySelector(".code-background").style.transform = `translateY(${
      scrollY * 0.05
    }px)`;

    // Parallax for other sections can be added here
  });

  // ===== MOBILE MENU (if needed in the future) =====
  // Code for mobile menu can be added here if your design includes one
});
