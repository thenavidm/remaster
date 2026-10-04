# Contributing

Thanks for looking. Here is what helps and what does not.

## Issues, yes

Bug reports are genuinely useful, and the more concrete the better: the
command you ran, the site or app it ran on, what you expected, and what
happened instead. A measurement JSON or a screenshot of the output helps most.

Feature requests are welcome too. Describe the clone you were making and the
step where Remaster fell short.

## Pull requests, no

The skill's wording, the checks' thresholds and the scripts are tuned
together against real clones of real products. A small change to one of them
moves what the others catch, so judging a patch means re-running those clones
end to end, which takes longer than writing it.

That is a property of how this is maintained, not a judgement on the patch.
If something is broken, an issue gets it fixed faster than a pull request will.

## Security

Please do not open a public issue for a vulnerability. Use the private
reporting path in [SECURITY.md](SECURITY.md).
