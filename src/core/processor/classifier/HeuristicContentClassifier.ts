import { IContentClassifier } from "./IContentTypeClassifier";
import {
  ClassificationResult,
  ContentPattern,
  ContentClassConfig,
} from "../../../types";
import { CONTENT_CLASSES } from "./CONTENT_CLASSES";
import { Logger } from "../../../shared";


interface ClassConfigWithNegatives extends ContentClassConfig {
  negativePatterns: ContentPattern[];
}

export class HeuristicContentClassifier implements IContentClassifier {
  private crossValidatedClasses: Record<string, ClassConfigWithNegatives> = {};

  constructor(private logger: Logger) {
    this.initializeCrossValidation();
  }

  private initializeCrossValidation() {
    // For each class, collect ALL other classes positive patterns as negatives
    for (const [className, config] of Object.entries(CONTENT_CLASSES)) {
      const negativePatterns: ContentPattern[] = [];
      
      // Collect positive patterns from ALL other classes
      for (const [otherClassName, otherConfig] of Object.entries(CONTENT_CLASSES)) {
        if (otherClassName !== className) {
          // Add other classes positive patterns as negatives with reduced weight
          for (const pattern of otherConfig.contentPatterns) {
            negativePatterns.push({
              pattern: pattern.pattern,
              weight: -pattern.weight * 0.15, // Negative weight, reduced magnitude
            });
          }
        }
      }

      this.crossValidatedClasses[className] = {
        ...config,
        negativePatterns
      };
    }
  }

  async classify(content: string, path: string): Promise<ClassificationResult[]> {
    const results = Object.values(this.crossValidatedClasses).map(config => 
      this.calculateDensityScore(content, path, config)
    );

    return results
      .filter(result => result.confidence > 0.7) // Basic threshold
      .sort((a, b) => b.confidence - a.confidence);
  }

  private calculateDensityScore(content: string, path: string, config: ClassConfigWithNegatives): ClassificationResult {
    let totalScore = 0;

    // File pattern scoring
    for (const { pattern, weight } of config.filePatterns) {
      if (pattern.test(path)) {
        totalScore += weight;
      }
    }

    // Positive pattern scoring
    for (const { pattern, weight } of config.contentPatterns) {
      const matches = content.match(pattern) || [];
      const score = Math.log(matches.length + 1) * weight;
      if (score > 0) {
        totalScore += score;
      }
    }

    // Negative pattern scoring
    for (const { pattern, weight } of config.negativePatterns) {
      const matches = content.match(pattern) || [];
      const score = Math.log(matches.length + 1) * weight; // weight is negative
      if (score < 0) {
        totalScore += score;
      }
    }

    // Score normalization
    const normalizedScore = totalScore / 15;
    const confidence = Math.max(0.05, Math.min(0.95, 0.5 * (1 + Math.tanh(normalizedScore))));

    return {
      class: config.name,
      confidence: confidence,
    };
  }
}
