-- Drop code from the document before word counting, so the count reflects
-- prose only (typically what a word limit refers to). Removes fenced code
-- blocks, executable code chunks, and inline code spans.
--
-- Note: Quarto/knitr chunks written as ```{r} parse as inline Code (the {r}
-- info string is not a valid attribute), so removing Code is required to
-- exclude them, not just CodeBlock.

function CodeBlock(_)
  return {}
end

function Code(_)
  return {}
end
