import {prechecks} from '../../src/functions/prechecks'
import * as isAllowed from '../../src/functions/allowlist'
import * as core from '@actions/core'

// Globals for testing
const infoMock = jest.spyOn(core, 'info')
const warningMock = jest.spyOn(core, 'warning')

var environmentObj
var help_trigger
var context
var getCollabOK
var getPullsOK
var graphQLOK
var octokit

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(core, 'info').mockImplementation(() => {})
  jest.spyOn(core, 'debug').mockImplementation(() => {})
  jest.spyOn(core, 'warning').mockImplementation(() => {})
  jest.spyOn(core, 'setOutput').mockImplementation(() => {})
  process.env.INPUT_PERMISSIONS = 'admin,write,maintain'

  environmentObj = {
    target: 'production',
    stable_branch_used: false,
    noop: false,
    params: null
  }
  help_trigger = '.help'

  context = {
    actor: 'monalisa',
    repo: {
      owner: 'corp',
      repo: 'test'
    },
    issue: {
      number: 123
    }
  }

  getCollabOK = jest
    .fn()
    .mockReturnValue({data: {permission: 'write'}, status: 200})
  getPullsOK = jest.fn().mockReturnValue({
    data: {
      head: {
        ref: 'test-ref',
        sha: 'abc123'
      },
      base: {
        ref: 'base-ref'
      }
    },
    status: 200
  })

  graphQLOK = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'CLEAN',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 3
                },
                statusCheckRollup: {
                  state: 'SUCCESS'
                }
              }
            }
          ]
        }
      }
    }
  })

  octokit = {
    rest: {
      repos: {
        getCollaboratorPermissionLevel: getCollabOK
      },
      pulls: {
        get: getPullsOK
      }
    },
    graphql: graphQLOK
  }
})

test('runs prechecks and finds that the IssueOps command is valid for a branch deployment', async () => {
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message: '✔️ PR is approved and all CI checks passed - OK',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123'
  })
})

test('runs prechecks and finds that the IssueOps command is valid for a rollback deployment', async () => {
  octokit.rest.repos.getBranch = jest
    .fn()
    .mockReturnValueOnce({data: {commit: {sha: 'deadbeef'}}, status: 200})

  environmentObj.stable_branch_used = true

  expect(
    await prechecks(
      '.deploy main',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message: '✔️ Deployment to the **stable** branch requested - OK',
    noopMode: false,
    ref: 'main',
    status: true,
    sha: 'deadbeef'
  })
})

test('runs prechecks and finds that the IssueOps command is valid for a noop deployment', async () => {
  environmentObj.noop = true
  expect(
    await prechecks(
      '.noop',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message: '✔️ PR is approved and all CI checks passed - OK',
    noopMode: true,
    ref: 'test-ref',
    status: true,
    sha: 'abc123'
  })
})

test('runs prechecks and finds that the IssueOps command is valid without defined CI checks', async () => {
  octokit.graphql = jest.fn().mockReturnValueOnce({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED'
      }
    }
  })
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message:
      '✔️ CI checks have not been defined but the PR has been approved - OK',
    status: true,
    noopMode: false,
    ref: 'test-ref',
    sha: 'abc123'
  })
  expect(infoMock).toHaveBeenCalledWith(
    "Could not retrieve PR commit status: TypeError: Cannot read properties of undefined (reading 'nodes') - Handled: OK"
  )
  expect(infoMock).toHaveBeenCalledWith(
    'Skipping commit status check and proceeding...'
  )
})

test('runs prechecks and fails due to bad user permissions', async () => {
  octokit.rest.repos.getCollaboratorPermissionLevel = jest
    .fn()
    .mockReturnValueOnce({data: {permission: 'read'}, status: 200})
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message:
      '👋 __monalisa__, seems as if you have not admin/write/maintain permissions in this repo, permissions: read',
    status: false
  })
})

test('runs prechecks and fails due to a bad pull request', async () => {
  octokit.rest.pulls.get = jest.fn().mockReturnValueOnce({status: 500})
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message: 'Could not retrieve PR info: 500',
    status: false
  })
})

// Review checks and CI checks

test('runs prechecks and finds that reviews and CI checks have not been defined', async () => {
  octokit.graphql = jest.fn().mockReturnValueOnce({
    repository: {
      pullRequest: {
        reviewDecision: null
      }
    }
  })
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message:
      '⚠️ CI checks have not been defined and required reviewers have not been defined... proceeding - OK',
    status: true,
    noopMode: false,
    ref: 'test-ref',
    sha: 'abc123'
  })
  expect(infoMock).toHaveBeenCalledWith(
    "Could not retrieve PR commit status: TypeError: Cannot read properties of undefined (reading 'nodes') - Handled: OK"
  )
  expect(infoMock).toHaveBeenCalledWith(
    'Skipping commit status check and proceeding...'
  )
  expect(infoMock).toHaveBeenCalledWith(
    '⚠️ CI checks have not been defined and required reviewers have not been defined... proceeding - OK'
  )
})

test('runs prechecks and finds CI checks pass but reviews are not defined', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: null,
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
                statusCheckRollup: {
                  state: 'SUCCESS'
                }
              }
            }
          ]
        }
      }
    }
  })
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message:
      '⚠️ CI checks have been defined but required reviewers have not been defined... proceeding - OK',
    status: true,
    noopMode: false,
    ref: 'test-ref',
    sha: 'abc123'
  })
  expect(infoMock).toHaveBeenLastCalledWith(
    '⚠️ CI checks have been defined but required reviewers have not been defined... proceeding - OK'
  )
})

test('runs prechecks and finds CI is passing and the PR has not been reviewed BUT it is a noop deploy', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
                statusCheckRollup: {
                  state: 'SUCCESS'
                }
              }
            }
          ]
        }
      }
    }
  })

  environmentObj.noop = true

  expect(
    await prechecks(
      '.noop',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message: '✔️ All CI checks passed and **noop** requested - OK',
    status: true,
    noopMode: true,
    ref: 'test-ref',
    sha: 'abc123'
  })
})

test('runs prechecks and finds that the IssueOps command is valid for a branch deployment and is from a forked repository', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 8
                },
                statusCheckRollup: {
                  state: 'SUCCESS'
                }
              }
            }
          ]
        }
      }
    }
  })
  octokit.rest.pulls.get = jest.fn().mockReturnValue({
    data: {
      head: {
        sha: 'abcde12345',
        ref: 'test-ref',
        label: 'test-repo:test-ref',
        repo: {
          fork: true
        }
      }
    },
    status: 200
  })
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message: '✔️ PR is approved and all CI checks passed - OK',
    status: true,
    noopMode: false,
    ref: 'abcde12345',
    sha: 'abcde12345'
  })
})

test('runs prechecks and finds that the IssueOps command is on a PR from a forked repo and is not allowed', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
                statusCheckRollup: {
                  state: 'SUCCESS'
                }
              }
            }
          ]
        }
      }
    }
  })
  octokit.rest.pulls.get = jest.fn().mockReturnValue({
    data: {
      head: {
        sha: 'abcde12345',
        ref: 'test-ref',
        repo: {
          fork: true
        }
      }
    },
    status: 200
  })
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      false,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message: `### ⚠️ Cannot proceed with deployment\n\nThis Action has been explicity configured to prevent deployments from forks. You can change this via this Action's inputs if needed`,
    status: false
  })
})

test('runs prechecks and finds CI is pending and the PR has not been reviewed BUT it is a noop deploy', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 2
                },
                statusCheckRollup: {
                  state: 'PENDING'
                }
              }
            }
          ]
        }
      }
    }
  })

  environmentObj.noop = true

  expect(
    await prechecks(
      '.noop',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `REVIEW_REQUIRED`\n- commitStatus: `PENDING`\n\n> Reviews are not required for a noop deployment but CI checks must be passing in order to continue',
    status: false
  })
})

test('runs prechecks and finds CI checks are pending, the PR has not been reviewed, and it is not a noop deploy', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
                statusCheckRollup: {
                  state: 'PENDING'
                }
              }
            }
          ]
        }
      }
    }
  })
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `REVIEW_REQUIRED`\n- commitStatus: `PENDING`\n\n> CI checks must be passing and the PR must be reviewed in order to continue',
    status: false
  })
})

test('runs prechecks and finds CI is pending and reviewers have not been defined', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: null,
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 3
                },
                statusCheckRollup: {
                  state: 'PENDING'
                }
              }
            }
          ]
        }
      }
    }
  })
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `null`\n- commitStatus: `PENDING`\n\n> CI checks must be passing in order to continue',
    status: false
  })
})

test('runs prechecks and finds CI checked have not been defined, the PR has not been reviewed, and it IS a noop deploy', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED'
      }
    }
  })

  environmentObj.noop = true

  expect(
    await prechecks(
      '.noop',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message: '✔️ CI checks have not been defined and **noop** requested - OK',
    status: true,
    noopMode: true,
    ref: 'test-ref',
    sha: 'abc123'
  })
})

test('runs prechecks and deploys to the stable branch', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: null
      }
    }
  })
  octokit.rest.repos.getBranch = jest
    .fn()
    .mockReturnValueOnce({data: {commit: {sha: 'deadbeef'}}, status: 200})

  environmentObj.stable_branch_used = true

  expect(
    await prechecks(
      '.deploy main',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message: '✔️ Deployment to the **stable** branch requested - OK',
    status: true,
    noopMode: false,
    ref: 'main',
    sha: 'deadbeef'
  })
})

test('runs prechecks and finds the PR has been approved but CI checks are pending and it is not a noop deploy', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 14
                },
                statusCheckRollup: {
                  state: 'PENDING'
                }
              }
            }
          ]
        }
      }
    }
  })
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `APPROVED`\n- commitStatus: `PENDING`\n\n> CI checks must be passing in order to continue',
    status: false
  })
})

test('runs prechecks and finds CI is passing but the PR is missing an approval', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
                statusCheckRollup: {
                  state: 'SUCCESS'
                }
              }
            }
          ]
        }
      }
    }
  })
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `REVIEW_REQUIRED`\n- commitStatus: `SUCCESS`\n\n> CI checks are passing but an approval is required before you can proceed with deployment',
    status: false
  })
})

test('runs prechecks and finds the PR is approved but CI is failing', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
                statusCheckRollup: {
                  state: 'FAILURE'
                }
              }
            }
          ]
        }
      }
    }
  })
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `APPROVED`\n- commitStatus: `FAILURE`\n\n> Your pull request is approved but CI checks are failing',
    status: false
  })
})

test('runs prechecks and finds the PR does not require approval but CI is failing', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: null,
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
                statusCheckRollup: {
                  state: 'FAILURE'
                }
              }
            }
          ]
        }
      }
    }
  })
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `null`\n- commitStatus: `FAILURE`\n\n> Your pull request does not require approvals but CI checks are failing',
    status: false
  })
})

test('runs prechecks and finds the PR is NOT reviewed and CI checks have NOT been defined and NOT a noop deploy', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED'
      }
    }
  })
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `REVIEW_REQUIRED`\n- commitStatus: `null`\n\n> Your pull request is missing required approvals',
    status: false
  })
})

test('runs prechecks and finds the PR is approved and CI checks have NOT been defined and NOT a noop deploy', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED'
      }
    }
  })
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message:
      '✔️ CI checks have not been defined but the PR has been approved - OK',
    status: true,
    noopMode: false,
    ref: 'test-ref',
    sha: 'abc123'
  })
})

test('runs prechecks and finds the PR is behind the stable branch and a noop deploy and force updates the branch', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'BEHIND',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
                statusCheckRollup: {
                  state: 'SUCCESS'
                }
              }
            }
          ]
        }
      }
    }
  })
  octokit.rest.pulls.updateBranch = jest.fn().mockReturnValue({
    data: {
      message: 'Updating pull request branch.',
      url: 'https://api.github.com/repos/foo/bar/pulls/123'
    },
    status: 202
  })
  expect(
    await prechecks(
      '.noop',
      '.deploy',
      '.noop',
      'force',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- mergeStateStatus: `BEHIND`\n- update_branch: `force`\n\n> I went ahead and updated your branch with `main` - Please try again once this operation is complete',
    status: false
  })
})

test('runs prechecks and finds the PR is un-mergable and a noop deploy', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'DIRTY',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
                statusCheckRollup: {
                  state: 'SUCCESS'
                }
              }
            }
          ]
        }
      }
    }
  })
  expect(
    await prechecks(
      '.noop',
      '.deploy',
      '.noop',
      'warn',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n- mergeStateStatus: `DIRTY`\n\n> A merge commit cannot be cleanly created',
    status: false
  })
})

test('runs prechecks and finds the PR is BEHIND and a noop deploy and it fails to update the branch', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'BEHIND',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
                statusCheckRollup: {
                  state: 'SUCCESS'
                }
              }
            }
          ]
        }
      }
    }
  })
  octokit.rest.pulls.updateBranch = jest.fn().mockReturnValue({
    data: {
      message: 'merge conflict between base and head',
      url: 'https://api.github.com/repos/foo/bar/pulls/123'
    },
    status: 422
  })
  expect(
    await prechecks(
      '.noop',
      '.deploy',
      '.noop',
      'force',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- update_branch http code: `422`\n- update_branch: `force`\n\n> Failed to update pull request branch with `main`',
    status: false
  })
})

test('runs prechecks and finds the PR is BEHIND and a noop deploy and it hits an error when force updating the branch', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'BEHIND',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
                statusCheckRollup: {
                  state: 'SUCCESS'
                }
              }
            }
          ]
        }
      }
    }
  })
  octokit.rest.pulls.updateBranch = jest.fn().mockReturnValue(null)

  environmentObj.noop = true

  expect(
    await prechecks(
      '.noop',
      '.deploy',
      '.noop',
      'force',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message:
      "### ⚠️ Cannot proceed with deployment\n\n```text\nCannot read properties of null (reading 'status')\n```",
    status: false
  })
})

test('runs prechecks and finds the PR is BEHIND and a noop deploy and update_branch is set to warn', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'BEHIND',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
                statusCheckRollup: {
                  state: 'SUCCESS'
                }
              }
            }
          ]
        }
      }
    }
  })

  environmentObj.noop = true

  expect(
    await prechecks(
      '.noop',
      '.deploy',
      '.noop',
      'warn',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\nYour branch is behind the base branch and will need to be updated before deployments can continue.\n\n- mergeStateStatus: `BEHIND`\n- update_branch: `warn`\n\n> Please ensure your branch is up to date with the `main` branch and try again',
    status: false
  })
})

test('runs prechecks and finds the PR is a DRAFT PR and a noop deploy', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'BLOCKED',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
                statusCheckRollup: {
                  state: 'SUCCESS'
                }
              }
            }
          ]
        }
      }
    }
  })
  octokit.rest.pulls.get = jest.fn().mockReturnValue({
    data: {
      head: {
        ref: 'test-ref',
        sha: 'abc123'
      },
      base: {
        ref: 'main'
      },
      draft: true
    },
    status: 200
  })
  octokit.rest.repos.getBranch = jest
    .fn()
    .mockReturnValueOnce({data: {commit: {sha: 'deadbeef'}}, status: 200})
  octokit.rest.repos.compareCommits = jest
    .fn()
    .mockReturnValueOnce({data: {behind_by: 0}, status: 200})

  environmentObj.noop = true

  expect(
    await prechecks(
      '.noop',
      '.deploy',
      '.noop',
      'warn',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n> Your pull request is in a draft state',
    status: false
  })
  expect(warningMock).toHaveBeenCalledWith(
    'deployment requested on a draft PR from a non-allowed environment'
  )
})

test('runs prechecks and finds the PR is a DRAFT PR and from an allowed environment for draft deployments', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'CLEAN',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
                statusCheckRollup: {
                  state: 'SUCCESS'
                }
              }
            }
          ]
        }
      }
    }
  })
  octokit.rest.pulls.get = jest.fn().mockReturnValue({
    data: {
      head: {
        ref: 'test-ref',
        sha: 'abc123'
      },
      base: {
        ref: 'main'
      },
      draft: true // telling the test suite that our PR is in a draft state
    },
    status: 200
  })

  environmentObj.target = 'staging'

  expect(
    await prechecks(
      '.deploy to staging',
      '.deploy',
      '.noop',
      'warn',
      'main',
      '123',
      true,
      '',
      '',
      'sandbox,staging', // draft_permitted_targets input option
      'staging', // the environment we are deploying to
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message: '✔️ PR is approved and all CI checks passed - OK',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123'
  })
})

test('runs prechecks and finds the PR is BEHIND and a noop deploy and the commit status is null', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'BEHIND',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
                statusCheckRollup: {
                  state: 'FAILED'
                }
              }
            }
          ]
        }
      }
    }
  })

  environmentObj.noop = true

  expect(
    await prechecks(
      '.noop',
      '.deploy',
      '.noop',
      'warn',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `APPROVED`\n- commitStatus: `FAILED`\n\n> This is usually caused by missing PR approvals or CI checks failing',
    status: false
  })
})

test('runs prechecks and finds the PR is BEHIND and a full deploy and update_branch is set to warn', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'BEHIND',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
                statusCheckRollup: {
                  state: 'SUCCESS'
                }
              }
            }
          ]
        }
      }
    }
  })
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      '.noop',
      'warn',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\nYour branch is behind the base branch and will need to be updated before deployments can continue.\n\n- mergeStateStatus: `BEHIND`\n- update_branch: `warn`\n\n> Please ensure your branch is up to date with the `main` branch and try again',
    status: false
  })
})

test('runs prechecks and finds the PR is behind the stable branch and a full deploy and force updates the branch', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'BEHIND',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
                statusCheckRollup: {
                  state: 'SUCCESS'
                }
              }
            }
          ]
        }
      }
    }
  })
  octokit.rest.pulls.updateBranch = jest.fn().mockReturnValue({
    data: {
      message: 'Updating pull request branch.',
      url: 'https://api.github.com/repos/foo/bar/pulls/123'
    },
    status: 202
  })
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      '.noop',
      'force',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- mergeStateStatus: `BEHIND`\n- update_branch: `force`\n\n> I went ahead and updated your branch with `main` - Please try again once this operation is complete',
    status: false
  })
})

test('runs prechecks and fails with a non 200 permissionRes.status', async () => {
  octokit.rest.repos.getCollaboratorPermissionLevel = jest
    .fn()
    .mockReturnValueOnce({data: {permission: 'admin'}, status: 500})
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message: 'Permission check returns non-200 status: 500',
    status: false
  })
})

test('runs prechecks and finds that the IssueOps commands are valid and from a defined admin', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
                statusCheckRollup: {
                  state: 'SUCCESS'
                }
              }
            }
          ]
        }
      }
    }
  })
  jest.spyOn(isAllowed, 'isAllowed').mockImplementation(() => {
    return true
  })
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message:
      '✔️ CI is passing and approval is bypassed due to admin rights - OK',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123'
  })
})

test('runs prechecks and finds that the IssueOps commands are valid with parameters and from a defined admin', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
                statusCheckRollup: {
                  state: 'SUCCESS'
                }
              }
            }
          ]
        }
      }
    }
  })
  jest.spyOn(isAllowed, 'isAllowed').mockImplementation(() => {
    return true
  })

  environmentObj.params = 'something something something'

  expect(
    await prechecks(
      '.deploy to production | something something something',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message:
      '✔️ CI is passing and approval is bypassed due to admin rights - OK',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123'
  })
})

test('runs prechecks and finds that the IssueOps commands are valid with parameters and from a defined admin', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
                statusCheckRollup: {
                  state: 'SUCCESS'
                }
              }
            }
          ]
        }
      }
    }
  })
  jest.spyOn(isAllowed, 'isAllowed').mockImplementation(() => {
    return true
  })

  environmentObj.noop = true
  environmentObj.params = 'something something something'

  expect(
    await prechecks(
      '.noop to production | something something something',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message: '✔️ All CI checks passed and **noop** requested - OK',
    noopMode: true,
    ref: 'test-ref',
    status: true,
    sha: 'abc123'
  })
})

test('runs prechecks and finds that the IssueOps commands are valid with parameters and from a defined admin when CI is not defined', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
                statusCheckRollup: {
                  state: null
                }
              }
            }
          ]
        }
      }
    }
  })
  jest.spyOn(isAllowed, 'isAllowed').mockImplementation(() => {
    return true
  })
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message:
      '✔️ CI checks have not been defined and approval is bypassed due to admin rights - OK',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123'
  })

  expect(infoMock).toHaveBeenLastCalledWith(
    '✔️ CI checks have not been defined and approval is bypassed due to admin rights - OK'
  )
})

test('runs prechecks and finds that no CI checks exist and reviews are not defined', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: null,
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 0
                },
                statusCheckRollup: null
              }
            }
          ]
        }
      }
    }
  })
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message:
      '⚠️ CI checks have not been defined and required reviewers have not been defined... proceeding - OK',
    status: true,
    noopMode: false,
    ref: 'test-ref',
    sha: 'abc123'
  })
  expect(infoMock).toHaveBeenLastCalledWith(
    '⚠️ CI checks have not been defined and required reviewers have not been defined... proceeding - OK'
  )
})

test('runs prechecks and finds that no CI checks exist but reviews are defined and it is from an admin', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 0
                },
                statusCheckRollup: null
              }
            }
          ]
        }
      }
    }
  })
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message:
      '✔️ CI checks have not been defined and approval is bypassed due to admin rights - OK',
    status: true,
    noopMode: false,
    ref: 'test-ref',
    sha: 'abc123'
  })
  expect(infoMock).toHaveBeenLastCalledWith(
    '✔️ CI checks have not been defined and approval is bypassed due to admin rights - OK'
  )
})

test('runs prechecks and finds that no CI checks exist and the PR is not approved, but it is from an admin', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 0
                },
                statusCheckRollup: null
              }
            }
          ]
        }
      }
    }
  })
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      '',
      '',
      '',
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message:
      '✔️ CI checks have not been defined and approval is bypassed due to admin rights - OK',
    status: true,
    noopMode: false,
    ref: 'test-ref',
    sha: 'abc123'
  })
  expect(infoMock).toHaveBeenLastCalledWith(
    '✔️ CI checks have not been defined and approval is bypassed due to admin rights - OK'
  )
})

test('runs prechecks and finds that skip_ci is set and the PR has been approved', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 0
                },
                statusCheckRollup: null
              }
            }
          ]
        }
      }
    }
  })

  environmentObj.target = 'development'

  expect(
    await prechecks(
      '.deploy to development',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      'development', // skip_ci
      '', // skip_reviews
      '', // draft_permitted_targets
      'development', // the environment the deployment was sent to
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message:
      '✔️ CI requirements have been disabled for this environment and the PR has been approved - OK',
    status: true,
    noopMode: false,
    ref: 'test-ref',
    sha: 'abc123'
  })
  expect(infoMock).toHaveBeenCalledWith(
    '✔️ CI requirements have been disabled for this environment and the PR has been approved - OK'
  )
})

test('runs prechecks and finds that the commit status is success and skip_reviews is set for the environment', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
                statusCheckRollup: {
                  state: 'SUCCESS'
                }
              }
            }
          ]
        }
      }
    }
  })
  jest.spyOn(isAllowed, 'isAllowed').mockImplementation(() => {
    return false
  })

  environmentObj.target = 'staging'

  expect(
    await prechecks(
      '.deploy to staging',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      'development', // skip_ci
      'staging', // skip_reviews
      '', // draft_permitted_targets
      'staging', // the environment the deployment was sent to
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message:
      '✔️ CI checked passsed and required reviewers have been disabled for this environment - OK',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123'
  })

  expect(infoMock).toHaveBeenCalledWith(
    '✔️ CI checked passsed and required reviewers have been disabled for this environment - OK'
  )
})

test('runs prechecks on a custom deploy comment with a custom variable at the end', async () => {
  environmentObj.target = 'dev'
  environmentObj.params = 'something'
  expect(
    await prechecks(
      '.deploy dev something', // comment with a custom variable at the end
      '.deploy', // trigger
      '.noop', // noop trigger
      'disabled', // update_branch
      'main', // stable_branch
      '123', // issue_number
      true, // allowForks
      'dev', // skip_ci
      'dev', // skip_reviews
      '', // draft_permitted_targets
      'dev', // the environment the deployment was sent to
      environmentObj,
      help_trigger,
      context, // event context
      octokit // octokit instance
    )
  ).toStrictEqual({
    message:
      '✔️ CI requirements have been disabled for this environment and pr reviews have also been disabled for this environment - OK',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123'
  })

  expect(infoMock).toHaveBeenCalledWith(
    '✔️ CI requirements have been disabled for this environment and pr reviews have also been disabled for this environment - OK'
  )
})

test('runs prechecks and finds that skip_ci is set and now reviews are defined', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: null,
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
                statusCheckRollup: {
                  state: 'FAILURE'
                }
              }
            }
          ]
        }
      }
    }
  })
  jest.spyOn(isAllowed, 'isAllowed').mockImplementation(() => {
    return false
  })

  environmentObj.target = 'development'

  expect(
    await prechecks(
      '.deploy to development',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      'development', // skip_ci
      'staging', // skip_reviews
      '', // draft_permitted_targets
      'development', // the environment the deployment was sent to
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message:
      '⚠️ CI requirements have been disabled for this environment and required reviewers have not been defined... proceeding - OK',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123'
  })

  expect(infoMock).toHaveBeenCalledWith(
    '⚠️ CI requirements have been disabled for this environment and required reviewers have not been defined... proceeding - OK'
  )
})

test('runs prechecks and finds that skip_ci is set, reviews are required, and its a noop deploy', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
                statusCheckRollup: {
                  state: 'SUCCESS'
                }
              }
            }
          ]
        }
      }
    }
  })
  jest.spyOn(isAllowed, 'isAllowed').mockImplementation(() => {
    return false
  })

  environmentObj.target = 'development'
  environmentObj.noop = true

  expect(
    await prechecks(
      '.noop to development',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      'development', // skip_ci
      '', // skip_reviews
      '', // draft_permitted_targets
      'development', // the environment the deployment was sent to
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message:
      '✔️ CI requirements have been disabled for this environment and **noop** requested - OK',
    noopMode: true,
    ref: 'test-ref',
    status: true,
    sha: 'abc123'
  })

  expect(infoMock).toHaveBeenCalledWith(
    '✔️ CI requirements have been disabled for this environment and **noop** requested - OK'
  )
})

test('runs prechecks and finds that skip_ci is set and skip_reviews is set', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
                statusCheckRollup: {
                  state: 'FAILURE'
                }
              }
            }
          ]
        }
      }
    }
  })
  jest.spyOn(isAllowed, 'isAllowed').mockImplementation(() => {
    return false
  })

  environmentObj.target = 'development'

  expect(
    await prechecks(
      '.deploy to development',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      'development', // skip_ci
      'development,staging', // skip_reviews
      '', // draft_permitted_targets
      'development', // the environment the deployment was sent to
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message:
      '✔️ CI requirements have been disabled for this environment and pr reviews have also been disabled for this environment - OK',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123'
  })

  expect(infoMock).toHaveBeenCalledWith(
    '✔️ CI requirements have been disabled for this environment and pr reviews have also been disabled for this environment - OK'
  )
})

test('runs prechecks and finds that skip_ci is set and the deployer is an admin', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
                statusCheckRollup: {
                  state: 'FAILURE'
                }
              }
            }
          ]
        }
      }
    }
  })
  jest.spyOn(isAllowed, 'isAllowed').mockImplementation(() => {
    return true
  })

  environmentObj.target = 'development'

  expect(
    await prechecks(
      '.deploy to development',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      'development', // skip_ci
      '', // skip_reviews
      '', // draft_permitted_targets
      'development', // the environment the deployment was sent to
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message:
      '✔️ CI requirements have been disabled for this environment and approval is bypassed due to admin rights - OK',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123'
  })

  expect(infoMock).toHaveBeenCalledWith(
    '✔️ CI requirements have been disabled for this environment and approval is bypassed due to admin rights - OK'
  )
})

test('runs prechecks and finds that CI is pending and reviewers have not been defined and it IS a noop deploy', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: null,
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
                statusCheckRollup: {
                  state: 'PENDING'
                }
              }
            }
          ]
        }
      }
    }
  })
  jest.spyOn(isAllowed, 'isAllowed').mockImplementation(() => {
    return false
  })

  environmentObj.noop = true

  expect(
    await prechecks(
      '.noop',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      '', // skip_ci
      '', // skip_reviews
      '', // draft_permitted_targets
      'production', // the environment the deployment was sent to
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message: `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`null\`\n- commitStatus: \`PENDING\`\n\n> CI checks must be passing in order to continue`,
    status: false
  })

  expect(infoMock).toHaveBeenCalledWith(
    'note: even noop deploys require CI to finish and be in a passing state'
  )
})

test('runs prechecks and finds that the PR is NOT reviewed and CI checks have been disabled and it is NOT a noop deploy', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
                statusCheckRollup: {
                  state: 'PENDING'
                }
              }
            }
          ]
        }
      }
    }
  })
  jest.spyOn(isAllowed, 'isAllowed').mockImplementation(() => {
    return false
  })

  environmentObj.target = 'staging'

  expect(
    await prechecks(
      '.deploy to staging',
      '.deploy',
      '.noop',
      'disabled',
      'main',
      '123',
      true,
      'staging', // skip_ci
      'production', // skip_reviews
      '', // draft_permitted_targets
      'staging', // the environment the deployment was sent to
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message: `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`REVIEW_REQUIRED\`\n- commitStatus: \`skip_ci\`\n\n> Your pull request is missing required approvals`,
    status: false
  })

  expect(infoMock).toHaveBeenCalledWith(
    'note: CI checks are disabled for this environment so they will not be evaluated'
  )
})

test('runs prechecks and finds the PR is behind the stable branch (BLOCKED) and a noop deploy and force updates the branch', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'BLOCKED',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
                statusCheckRollup: {
                  state: 'SUCCESS'
                }
              }
            }
          ]
        }
      }
    }
  })
  octokit.rest.pulls.get = jest.fn().mockReturnValue({
    data: {
      head: {
        ref: 'test-ref',
        sha: 'abc123'
      },
      base: {
        ref: 'main'
      }
    },
    status: 200
  })
  octokit.rest.repos.getBranch = jest
    .fn()
    .mockReturnValueOnce({data: {commit: {sha: 'deadbeef'}}, status: 200})
  octokit.rest.repos.compareCommits = jest
    .fn()
    .mockReturnValueOnce({data: {behind_by: 1}, status: 200})
  octokit.rest.pulls.updateBranch = jest.fn().mockReturnValue({
    data: {
      message: 'Updating pull request branch.',
      url: 'https://api.github.com/repos/foo/bar/pulls/123'
    },
    status: 202
  })

  environmentObj.noop = true

  expect(
    await prechecks(
      '.noop',
      '.deploy',
      '.noop',
      'force',
      'main',
      '123',
      true,
      '',
      '',
      '', // draft_permitted_targets
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- mergeStateStatus: `BLOCKED`\n- update_branch: `force`\n\n> I went ahead and updated your branch with `main` - Please try again once this operation is complete',
    status: false
  })
})

test('runs prechecks and finds the PR is NOT behind the stable branch (BLOCKED) and a noop deploy and does not update the branch', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'BLOCKED',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
                statusCheckRollup: {
                  state: 'SUCCESS'
                }
              }
            }
          ]
        }
      }
    }
  })
  octokit.rest.pulls.get = jest.fn().mockReturnValue({
    data: {
      head: {
        ref: 'test-ref',
        sha: 'abc123'
      },
      base: {
        ref: 'main'
      }
    },
    status: 200
  })
  octokit.rest.repos.getBranch = jest
    .fn()
    .mockReturnValueOnce({data: {commit: {sha: 'deadbeef'}}, status: 200})
  octokit.rest.repos.compareCommits = jest
    .fn()
    .mockReturnValueOnce({data: {behind_by: 0}, status: 200})
  octokit.rest.pulls.updateBranch = jest.fn().mockReturnValue({
    data: {
      message: 'Updating pull request branch.',
      url: 'https://api.github.com/repos/foo/bar/pulls/123'
    },
    status: 202
  })

  environmentObj.noop = true

  expect(
    await prechecks(
      '.noop',
      '.deploy',
      '.noop',
      'force',
      'main',
      '123',
      true,
      '',
      '',
      '', // draft_permitted_targets
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message: '✔️ PR is approved and all CI checks passed - OK',
    status: true,
    noopMode: true,
    ref: 'test-ref',
    sha: 'abc123'
  })
})

test('runs prechecks and finds the PR is NOT behind the stable branch (HAS_HOOKS) and a noop deploy and does not update the branch', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'HAS_HOOKS',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
                statusCheckRollup: {
                  state: 'SUCCESS'
                }
              }
            }
          ]
        }
      }
    }
  })
  octokit.rest.pulls.get = jest.fn().mockReturnValue({
    data: {
      head: {
        ref: 'test-ref',
        sha: 'abc123'
      },
      base: {
        ref: 'main'
      }
    },
    status: 200
  })
  octokit.rest.repos.getBranch = jest
    .fn()
    .mockReturnValueOnce({data: {commit: {sha: 'deadbeef'}}, status: 200})
  octokit.rest.repos.compareCommits = jest
    .fn()
    .mockReturnValueOnce({data: {behind_by: 0}, status: 200})
  octokit.rest.pulls.updateBranch = jest.fn().mockReturnValue({
    data: {
      message: 'Updating pull request branch.',
      url: 'https://api.github.com/repos/foo/bar/pulls/123'
    },
    status: 202
  })

  environmentObj.noop = true

  expect(
    await prechecks(
      '.noop',
      '.deploy',
      '.noop',
      'force',
      'main',
      '123',
      true,
      '',
      '',
      '', // draft_permitted_targets
      'production',
      environmentObj,
      help_trigger,
      context,
      octokit
    )
  ).toStrictEqual({
    message: '✔️ PR is approved and all CI checks passed - OK',
    status: true,
    noopMode: true,
    ref: 'test-ref',
    sha: 'abc123'
  })
})
