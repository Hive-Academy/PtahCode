# Ptah CLI instance header and composer focus

The expanded header now uses one wrapping flex layout for Name, Provider, Model / Effort, Permission, and Network. The shared table detail grid was taking precedence and assigning the second column the width left over from the first. The original 800 px Electron capture showed that squeeze in Provider and Permission. Each field now has a minimum width, and the value areas and model/effort triggers use the same control-height token. The compact instance row keeps model and effort side by side and can truncate the model ID with its full value in the tooltip.

The shard 4 test failed at its final focus assertion after explicitly focusing an outside button. Programmatic close is expected to preserve that focus. The updated composer test checks outside focus after the first close, then closes the remaining overlay from inside and verifies focus returns to its trigger and overlay ownership clears. Native popovers now resolve the return target from their own trigger and release focus in the input-change hook before the portal detaches.

Focused Jest passed all 88 tests across composer activity, lanes table, native popover, and overlays/popover. The screenshot spec now captures 1280, 1440, 1824, and 800 px and checks field alignment and equal value and button heights. The new CSS uses existing gap and control-height tokens.

The final build attempt used Node v26.13.1 and default workers from Git Bash with the coordinator's exact command. Nx reported four successful dependencies and one failed renderer target. The wrapper released its lock after 98.6 seconds with exit code 1. The nested Angular log below ended during compilation and gave no compiler error or explicit out-of-memory diagnostic. The two earlier lower-concurrency attempts ended at the same stage.

```text
(node:9416) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
> Building...
(node:9416) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)

WARNING: "@nx/angular/tailwind" is deprecated and will be removed in Nx 25.
Migrate to Tailwind CSS v4 which no longer needs glob patterns for content detection.
See: https://nx.dev/docs/technologies/angular/guides/using-tailwind-css-with-angular-projects
```

Nx terminal logs are in `.nx/cache/terminalOutputs/5591729534602161238` and `.nx/cache/terminalOutputs/925865486635796323`. The Electron screenshot command remains unspent because the updated renderer could not be built in this lane. Only the original 800 px PNG was inspected. The coordinator is taking over the renderer build and screenshot review.
