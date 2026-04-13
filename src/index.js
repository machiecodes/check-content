import { getOctokit, context } from '@actions/github';
import * as core from "@actions/core";
import * as yaml from "js-yaml";
import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";

const token = process.env.GITHUB_TOKEN;

let categoriesFile = fs.readFileSync(".github/categories.yml", "utf8");
let categories = yaml.load(categoriesFile).categories;

let SYSTEM_PROMPT = `
### Instructions
You are an automated GitHub issue triage assistant. Your job is to review the title and body of incoming GitHub issues
and determine whether each issue falls into one of a set of predefined categories that warrant automatic closure. Be 
conservative in your judgments. If an issue appears to be a genuine bug report, feature request, or other valid           
contribution — even if poorly written or incomplete — classify it as "none". Only assign a different category when you 
are confident the issue clearly matches its description. The available categories, along with descriptions of what 
qualifies for each, are listed below. If the issue does not clearly fit any of them, classify its category as "none".

### Project-Specific Context
${core.getInput("project-context") || "None"}

### Categories
${categories.map(c => `**${c.name}**\n${c.description}`).join("\n\n")}

**None**
Issues that do not fit any of the above categories.

### Response Format
Return a JSON object with the following properties: 
- reasoning: Examine the issue and reason about which category it should be assigned to, coming to a definitive answer. 
You should then include the kebab-case-name of the category as the last line of your response.

### Example Response
"I am reasoning about which category the issue fits into. Since none of the categories seem to apply, this is a valid
issue and should remain open.

none"
`;

(async () => {
    const geminiModel = core.getInput("gemini-model");

    if (!geminiModel) {
        core.setFailed("You must provide a Gemini model to use!");
        return;
    }

    const userContent = `# ${context.payload.issue.title} #${context.payload.issue.number}\n` +
        `${context.payload.issue.body}`

    const ai = new GoogleGenAI({});
    let response;

    const attempts = parseInt(core.getInput("retry-attempts"), 10);

    for (let i = 0; i < attempts; i++) {
        try {
            response = await ai.models.generateContent({
                model: geminiModel,
                contents: userContent,
                config: {
                    systemInstruction: SYSTEM_PROMPT,
                }
            });

            break;
        } catch (err) {
            const canRetry = err.status === 503 || err.status === 429;
            if (!canRetry || i === attempts - 1) {
                core.setFailed(`Failed to query Gemini API:\n${err.message}`);
                return;
            }

            const delay = Math.pow(2, i);
            core.warning(`Gemini API request failed with status ${err.status}, retrying in ${delay}s.`);
            await new Promise(res => setTimeout(res, delay * 1000));
        }
    }

    if (!response) {
        core.setFailed("Failed to get a response from Gemini API.");
        return;
    }

    response = response.text

    const lines = response.trim().split('\n');
    const category = lines[lines.length - 1].trim();
    const reasoning = lines.slice(0, -1).join('\n').trim();

    core.info(`Category: ${category}, Reasoning: ${reasoning}`);

    if (category === "none") {
        return;
    }

    const octokit = getOctokit(token);
    const issueNumber = context.payload.issue.number;
    const owner = context.repo.owner;
    const repo = context.repo.repo;

    let message = categories.find(c => c.name === category).message
    message = Function(...Object.keys(context.payload), `return \`${message}\``)(...Object.values(context.payload))

    try {
        await octokit.rest.issues.createComment({
            owner, repo, issue_number: issueNumber, body: message
        });
    } catch (error) {
        core.error(`Failed to add comment: ${error.message}`);
    }

    const label = core.getInput("label");

    if (label) {
        try {
            await octokit.rest.issues.addLabels({
                owner, repo, issue_number: issueNumber, labels: [label]
            });
        } catch (error) {
            core.error(`Failed to add label: ${error.message}`);
        }
    }

    try {
        await octokit.rest.issues.update({
            owner, repo, issue_number: issueNumber, state: 'closed', state_reason: 'not_planned'
        });
    } catch (error) {
        core.setFailed(`Failed to close issue: ${error.message}`);
    }
})();