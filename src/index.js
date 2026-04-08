import { getOctokit, context } from '@actions/github';
import * as core from "@actions/core";
import * as yaml from "js-yaml";
import { GoogleGenAI, Type } from "@google/genai";
import * as fs from "fs";

const token = process.env.GITHUB_TOKEN;

let categoriesFile = fs.readFileSync(".github/categories.yml", "utf8");
let categories = yaml.load(categoriesFile).categories;
let categoryNames = categories.map(c => c.name);

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
Return a JSON object with the following properties: of the categories
- category: The name of the category that the issue should be assigned to, "none" if it does not fit any
- snippet: An excerpt of the issue, "evidence" of why the issue fits its category
`;

(async () => {
    core.info(SYSTEM_PROMPT)

    const userContent = `
    The github issue to be categorized:
    
    ### ${context.payload.issue.title}
    ${context.payload.issue.body}
    `

    core.info(userContent);

    const ai = new GoogleGenAI({});
    let response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: userContent,
        config: {
            systemInstruction: SYSTEM_PROMPT,
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    category: {type: Type.STRING, enum: categoryNames},
                    snippet: {type: Type.STRING}
                },
                required: ["category", "snippet"]
            }
        }
    });

    response = JSON.parse(response.text);
    core.info(response);

    if (response.category === "none") {
        return;
    }

    const octokit = getOctokit(token);
    const issueNumber = context.payload.issue.number;
    const owner = context.repo.owner;
    const repo = context.repo.repo;

    const message = `### This issue is being automatically closed.\n${categories.find(c => c.name === response.category).message}`;

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
            core.setFailed(`Failed to add label: ${error.message}`);
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