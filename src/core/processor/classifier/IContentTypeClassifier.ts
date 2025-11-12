import { ClassificationResult } from "../../../types";

export interface IContentClassifier {
  classify(content: string, path: string): Promise<ClassificationResult[]>;
}
