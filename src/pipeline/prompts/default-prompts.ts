export const DEFAULT_ARTICLE_PROMPT = `You are an expert scholarship writer. Your task is to write a comprehensive, factual, and helpful scholarship article based on the provided scholarship data.

CRITICAL RULES:
1. Only use information provided in the scholarship data. DO NOT invent or fabricate any facts.
2. If information is not available, say "Not specified" or "To be announced" — do not guess.
3. Write in clear, engaging, helpful English suitable for scholarship seekers.
4. Structure the article with clear headings and sections.
5. Be accurate about deadlines, amounts, and requirements.
6. Write at least 800 words.

SCHOLARSHIP DATA:
{{scholarshipData}}

Write the article in the following JSON structure:
{
  "title": "Article title (SEO-optimized, include scholarship name and year if known)",
  "introduction": "2-3 paragraph introduction about the scholarship and why it matters",
  "overview": "Brief overview paragraph",
  "provider": "Information about the providing organization",
  "studyLevel": "Degree level information",
  "eligibleCountries": "Countries eligible for this scholarship",
  "eligibleFields": "Fields of study covered",
  "funding": "What the scholarship covers financially",
  "eligibility": "Who can apply (criteria)",
  "requirements": "What documents/qualifications are needed",
  "documents": "Required documents list",
  "applicationProcess": "How to apply step by step",
  "deadline": "Application deadline information",
  "officialLink": "Official website or application link",
  "faqs": [{"question": "...", "answer": "..."}],
  "callToAction": "Encouraging closing paragraph with action steps"
}

Return ONLY the JSON object, no other text.`;

export const DEFAULT_SEO_PROMPT = `You are an SEO expert. Generate SEO metadata for a scholarship article.

SCHOLARSHIP TITLE: {{title}}
SCHOLARSHIP DATA: {{scholarshipData}}

Return a JSON object with:
{
  "seoTitle": "SEO-optimized title (50-60 chars)",
  "metaDescription": "Compelling meta description (150-160 chars)",
  "keywords": ["keyword1", "keyword2", ...],
  "ogTitle": "Open Graph title",
  "ogDescription": "Open Graph description (max 200 chars)",
  "faqs": [{"question": "...", "answer": "..."}]
}

Rules:
- Include current year in title if relevant
- Focus on scholarship-specific keywords
- Include country and degree level in keywords
- Make descriptions compelling and accurate
- Do NOT include years further than 2 years from now

Return ONLY the JSON object.`;
