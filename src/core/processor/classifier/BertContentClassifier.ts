import { Logger } from "../../../shared";
import { ClassificationResult } from "../../../types";
import { FileProcessingError } from "../../errors";
import { IContentClassifier } from "./IContentTypeClassifier";

export class BertContentClassifier implements IContentClassifier {
  constructor(private logger: Logger) {
  }

  async classify(content: string, path: string): Promise<ClassificationResult[]> {
    throw new FileProcessingError("BERT classifier not implemented.", path);
  }
}
