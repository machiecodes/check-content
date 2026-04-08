# Check Content

Check Content is a GitHub Action that uses AI to automatically analyze and close spammy, off-topic, or otherwise unwanted
issues. You define a set of categories, each with a description of what qualifies, and the AI will classify each new
issue against them, closing and commenting on any that match.

## Usage
You will first need to [create a Gemini API key](https://aistudio.google.com/api-keys) and add it to your repository's 
secrets under the name GEMINI_API_KEY. For small projects the free tier should be sufficient. Occasionally a model may 
be experiencing high traffic, in which case google temporarily blocks requests. The action will attempt to retry the
request a configurable number of times, but success is not guaranteed.

`.github/workflows/check-content.yml`
```yaml
name: Check Content

on:
  issues:
    types: [ opened ]

jobs:
  issue-moderator:
    runs-on: ubuntu-latest

    permissions:
      issues: write
      contents: read

    steps:
      - name: Checkout Repository
        uses: actions/checkout@v6
        with:
          persist-credentials: false

      - name: Check Content
        uses: machiecodes/check-content@v1.0.0
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          gemini-model: "gemini-2.5-flash"
          retry-attempts: "3"
          project-context: "Brief description of your project."
          close-label: "invalid"
```

`.github/categories.yml`
```yaml
categories:
  - name: spam
    description: Unsolicited advertising, phishing links, or bot-generated content.
    message: "This issue has been automatically closed as spam."

  - name: off-topic
    description: Issues that are not related to this project.
    message: "This issue is off-topic for this repository."
```

Each category has three fields:

- **`name`** A unique kebab-case identifier for the category.
- **`description`** A description of what qualifies as this category. The more specific the better, give examples or 
  keywords and be specific.
- **`message`** The comment posted on the issue when it is closed.

You can use JavaScript template syntax in `message`s to reference issue data; the message is evaluated against the
GitHub [webhook payload](https://docs.github.com/en/webhooks/webhook-events-and-payloads#issues). For example, you can
mention a user with `@${issue.user.login}`.

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE).
