const GITHUB_API_URL = "https://api.github.com";

async function initiateGitHubOAuth() {
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      {
        url: `https://github.com/login/oauth/authorize?client_id=${
          chrome.runtime.getManifest().oauth2.client_id
        }&scope=repo,gist`,
        interactive: true,
      },
      (redirectUrl) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        const code = new URLSearchParams(new URL(redirectUrl).search).get(
          "code"
        );
        exchangeCodeForToken(code).then(resolve).catch(reject);
      }
    );
  });
}

async function exchangeCodeForToken(code) {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: chrome.runtime.getManifest().oauth2.client_id,
      client_secret: "YOUR_CLIENT_SECRET", // Note: In production, this should be handled securely
      code,
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error_description);
  }

  return data.access_token;
}

async function fetchGitHubUser() {
  const response = await fetch(`${GITHUB_API_URL}/user`, {
    headers: {
      Authorization: `token ${state.githubToken}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  state.githubUser = await response.json();
  return state.githubUser;
}

// Add rate limit handling
async function checkRateLimits() {
  const response = await fetch(`${GITHUB_API_URL}/rate_limit`, {
    headers: {
      Authorization: `token ${state.githubToken}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to check rate limits");
  }

  const data = await response.json();
  const { rate } = data;

  if (rate.remaining < 10) {
    const resetDate = new Date(rate.reset * 1000);
    throw new Error(
      `API rate limit low. Resets at ${resetDate.toLocaleTimeString()}`
    );
  }

  return rate;
}

async function refreshToken() {
  try {
    const response = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: chrome.runtime.getManifest().oauth2.client_id,
          client_secret: "YOUR_CLIENT_SECRET",
          refresh_token: state.githubRefreshToken,
          grant_type: "refresh_token",
        }),
      }
    );

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error_description);
    }

    state.githubToken = data.access_token;
    state.githubRefreshToken = data.refresh_token;
    await chrome.storage.local.set({
      githubToken: data.access_token,
      githubRefreshToken: data.refresh_token,
    });

    return data.access_token;
  } catch (error) {
    console.error("Token refresh failed:", error);
    throw new Error("Failed to refresh GitHub token");
  }
}

async function fetchUserRepos() {
  try {
    const response = await fetch(
      `${GITHUB_API_URL}/user/repos?type=all&sort=updated`,
      {
        headers: {
          Authorization: `token ${state.githubToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    if (response.status === 403) {
      const rateLimitResponse = await checkRateLimits();
      throw new Error(
        `Rate limited. Resets at ${new Date(
          rateLimitResponse.reset * 1000
        ).toLocaleTimeString()}`
      );
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch repositories: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    if (error.message.includes("rate limit")) {
      throw error;
    }
    throw new Error("Failed to fetch repositories");
  }
}

// Enhance commit function with rate limit handling
async function commitToGitHub({ repo, path, content, message }) {
  try {
    await checkRateLimits();
    // First, try to get the file to check if it exists
    let sha;
    try {
      const existing = await fetch(
        `${GITHUB_API_URL}/repos/${state.githubUser.login}/${repo}/contents/${path}`,
        {
          headers: {
            Authorization: `token ${state.githubToken}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );
      const data = await existing.json();
      sha = data.sha;
    } catch (e) {
      // File doesn't exist, that's fine
    }

    const response = await fetch(
      `${GITHUB_API_URL}/repos/${state.githubUser.login}/${repo}/contents/${path}`,
      {
        method: "PUT",
        headers: {
          Authorization: `token ${state.githubToken}`,
          "Content-Type": "application/json",
          Accept: "application/vnd.github.v3+json",
        },
        body: JSON.stringify({
          message,
          content: btoa(content),
          sha,
        }),
      }
    );

    if (!response.ok) {
      throw new Error("Failed to commit to GitHub");
    }

    return response.json();
  } catch (error) {
    if (error.response?.status === 401) {
      await refreshToken();
      return commitToGitHub({ repo, path, content, message });
    }
    throw error;
  }
}

// Add repository management
async function createRepository(name, description, isPrivate = true) {
  const response = await fetch(`${GITHUB_API_URL}/user/repos`, {
    method: "POST",
    headers: {
      Authorization: `token ${state.githubToken}`,
      Accept: "application/vnd.github.v3+json",
    },
    body: JSON.stringify({
      name,
      description,
      private: isPrivate,
      auto_init: true,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to create repository");
  }

  return response.json();
}
