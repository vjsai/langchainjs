import { z, ZodTypeAny } from "zod";
import { BaseChain, ChainInputs } from "../base.js";
import { SerializedAPIChain } from "../serde.js";
import { LLMChain } from "../llm_chain.js";
import { BaseLanguageModel } from "../../base_language/index.js";
import { CallbackManagerForChainRun } from "../../callbacks/manager.js";
import { ChainValues } from "../../schema/index.js";
import {
  API_URL_PROMPT_TEMPLATE,
  API_RESPONSE_PROMPT_TEMPLATE,
} from "./prompts.js";
import { BasePromptTemplate } from "../../index.js";
import { StructuredOutputParser } from "../../output_parsers/structured.js";
import { OutputFixingParser } from "../../output_parsers/fix.js";

export interface APIChainInput extends Omit<ChainInputs, "memory"> {
  llm: BaseLanguageModel;
  apiAnswerChain: LLMChain;
  apiRequestChain: LLMChain;
  apiDocs: string;
  inputKey?: string;
  headers?: Record<string, string>;
  allowedMethods?: string[];
  /** Key to use for output, defaults to `output` */
  outputKey?: string;
}

export type APIChainOptions = {
  headers?: Record<string, string>;
  apiUrlPrompt?: BasePromptTemplate;
  apiResponsePrompt?: BasePromptTemplate;
};

export class APIChain extends BaseChain implements APIChainInput {
  llm: BaseLanguageModel;

  apiAnswerChain: LLMChain;

  apiRequestChain: LLMChain;

  apiDocs: string;

  headers = {};

  inputKey = "question";

  outputKey = "output";

  allowedMethods = ["GET", "POST"];

  get inputKeys() {
    return [this.inputKey];
  }

  get outputKeys() {
    return [this.outputKey];
  }

  constructor(fields: APIChainInput) {
    super(fields);
    this.apiRequestChain = fields.apiRequestChain;
    this.apiAnswerChain = fields.apiAnswerChain;
    this.apiDocs = fields.apiDocs;
    this.inputKey = fields.inputKey ?? this.inputKey;
    this.outputKey = fields.outputKey ?? this.outputKey;
    this.headers = fields.headers ?? this.headers;
    this.allowedMethods = fields.allowedMethods ?? this.allowedMethods;
  }

  /** @ignore */
  async _call(
    values: ChainValues,
    runManager?: CallbackManagerForChainRun
  ): Promise<ChainValues> {
    const question: string = values[this.inputKey];

    const api_json = await this.apiRequestChain.predict(
      { question, api_docs: this.apiDocs },
      runManager?.getChild()
    );

    const fixParser = OutputFixingParser.fromLLM(
      this.llm,
      APIChain.getApiParser()
    );
    const api_options = await fixParser.parse(api_json);

    if (!this.allowedMethods.includes(api_options.api_method)) {
      throw new Error(
        `${api_options.api_method} is not part of allowedMethods`
      );
    }

    const request_options =
      api_options.api_method === "GET" ||
      api_options.api_method === "HEAD" ||
      api_options.api_method === "DELETE"
        ? {
            method: api_options.api_method,
            headers: this.headers,
          }
        : {
            method: api_options.api_method,
            headers: this.headers,
            body: JSON.stringify(api_options.api_body),
          };

    const res = await fetch(api_options.api_url, request_options);
    const api_response = await res.text();

    const answer = await this.apiAnswerChain.predict(
      {
        question,
        api_docs: this.apiDocs,
        api_url: api_options.api_url,
        api_response,
      },
      runManager?.getChild()
    );

    return { [this.outputKey]: answer };
  }

  _chainType() {
    return "api_chain" as const;
  }

  static async deserialize(data: SerializedAPIChain) {
    const { api_request_chain, api_answer_chain, api_docs, llm } = data;

    if (!api_request_chain) {
      throw new Error("LLMChain must have api_request_chain");
    }
    if (!api_answer_chain) {
      throw new Error("LLMChain must have api_answer_chain");
    }

    if (!api_docs) {
      throw new Error("LLMChain must have api_docs");
    }

    return new APIChain({
      llm: await BaseLanguageModel.deserialize(llm),
      apiAnswerChain: await LLMChain.deserialize(api_answer_chain),
      apiRequestChain: await LLMChain.deserialize(api_request_chain),
      apiDocs: api_docs,
    });
  }

  serialize(): SerializedAPIChain {
    return {
      _type: this._chainType(),
      llm: this.llm.serialize(),
      api_answer_chain: this.apiAnswerChain.serialize(),
      api_request_chain: this.apiRequestChain.serialize(),
      api_docs: this.apiDocs,
    };
  }

  static getApiParserSchema(): ZodTypeAny {
    return z.object({
      api_url: z
        .string()
        .describe(
          "the formatted url in case of GET API call otherwise just the url"
        ),
      api_body: z
        .any()
        .describe("formatted key value pair for making API call"),
      api_method: z.string().describe("API method from documentation"),
    });
  }

  static getApiParser(): StructuredOutputParser<ZodTypeAny> {
    return StructuredOutputParser.fromZodSchema(this.getApiParserSchema());
  }

  static fromLLMAndAPIDocs(
    llm: BaseLanguageModel,
    apiDocs: string,
    options: APIChainOptions &
      Omit<
        APIChainInput,
        "apiAnswerChain" | "apiRequestChain" | "apiDocs" | "llm"
      > = {}
  ): APIChain {
    const {
      apiUrlPrompt = API_URL_PROMPT_TEMPLATE,
      apiResponsePrompt = API_RESPONSE_PROMPT_TEMPLATE,
    } = options;
    const apiRequestChain = new LLMChain({ prompt: apiUrlPrompt, llm });
    const apiAnswerChain = new LLMChain({ prompt: apiResponsePrompt, llm });
    return new this({
      llm,
      apiAnswerChain,
      apiRequestChain,
      apiDocs,
      ...options,
    });
  }
}
