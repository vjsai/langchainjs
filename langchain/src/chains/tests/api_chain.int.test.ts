import { test } from "@jest/globals";
import { OpenAI } from "../../llms/openai.js";
import { LLMChain } from "../llm_chain.js";
import { loadChain } from "../load.js";
import { APIChain, APIChainInput } from "../api/api_chain.js";
import {
  API_RESPONSE_PROMPT_TEMPLATE,
  API_URL_PROMPT_TEMPLATE,
} from "../api/prompts.js";
import { OPEN_METEO_DOCS } from "./example_data/open_meteo_docs.js";
import { POST_API_DOCS } from "./example_data/post_api_docs.js";
import { DELETE_API_DOCS } from "./example_data/delete_api_docs.js";

const test_api_docs = `
This API endpoint will search the notes for a user.

Endpoint: https://httpbin.org
GET /get

Query parameters:
q | string | The search term for notes
`;

const post_test_api_docs = `
API documentation:
Endpoint: https://httpbin.org

This API is for sending Postman message

POST /post

POST body table:
message | string | Message to send | required

Response schema (string):
result | string
`;

const testApiData = {
  api_docs: test_api_docs,
  question: "Search for notes containing langchain",
  api_json:
    '{"api_url":"https://httpbin.com/api/notes?q=langchain","api_method":"GET","api_data":{}}',
  api_response: JSON.stringify({
    success: true,
    results: [{ id: 1, content: "Langchain is awesome!" }],
  }),
  api_summary: "There is 1 note about langchain.",
};

test("Test APIChain", async () => {
  const model = new OpenAI({ modelName: "text-davinci-003" });
  const apiRequestChain = new LLMChain({
    prompt: API_URL_PROMPT_TEMPLATE,
    llm: model,
  });
  const apiAnswerChain = new LLMChain({
    prompt: API_RESPONSE_PROMPT_TEMPLATE,
    llm: model,
  });

  const apiChainInput: APIChainInput = {
    llm: model,
    apiAnswerChain,
    apiRequestChain,
    apiDocs: testApiData.api_docs,
  };

  const chain = new APIChain(apiChainInput);
  const res = await chain.call({
    question: "Search for notes containing langchain",
  });
  console.log({ res });
});

test("Test APIChain fromLLMAndApiDocs", async () => {
  // This test doesn't work as well with earlier models
  const model = new OpenAI({ modelName: "text-davinci-003" });
  const chain = APIChain.fromLLMAndAPIDocs(model, OPEN_METEO_DOCS);
  const res = await chain.call({
    question:
      "What is the weather like right now in Munich, Germany in degrees Farenheit?",
  });
  console.log({ res });
});

test("Test POST APIChain fromLLMAndApiDocs", async () => {
  const model = new OpenAI({ modelName: "text-davinci-003" });
  const chain = APIChain.fromLLMAndAPIDocs(model, post_test_api_docs);
  const res = await chain.call({
    question: "send a message hi langchain",
  });
  console.log({ res });
});

test("Test POST 2 APIChain fromLLMAndApiDocs", async () => {
  const model = new OpenAI({ modelName: "text-davinci-003" });
  const chain = APIChain.fromLLMAndAPIDocs(model, POST_API_DOCS);
  const res = await chain.call({
    question: "send a message hi langchain to channel3 with token5",
  });
  console.log({ res });
});

test("Test DELETE APIChain fromLLMAndApiDocs if not in allowedMethods", async () => {
  const model = new OpenAI({ modelName: "text-davinci-003" });
  const chain = APIChain.fromLLMAndAPIDocs(model, DELETE_API_DOCS);
  await expect(() =>
    chain.call({
      question: "delete a message with id 15",
    })
  ).rejects.toThrow();
});

test("Test DELETE APIChain fromLLMAndApiDocs if allowed in allowedMethods", async () => {
  const model = new OpenAI({ modelName: "text-davinci-003" });
  const chain = APIChain.fromLLMAndAPIDocs(model, DELETE_API_DOCS, {
    allowedMethods: ["GET", "POST", "DELETE"],
  });
  const res = await chain.call({
    question: "delete a message with id 15",
  });
  console.log({ res });
});

test("Load APIChain from hub", async () => {
  const chain = await loadChain("lc://chains/api/meteo/chain.json");
  const res = await chain.call({
    question:
      "What is the weather like right now in Munich, Germany in degrees Farenheit?",
  });
  console.log({ res });
});
