import cockpit from "cockpit";
import React from "react";
import {
	Button,
	Checkbox,
	Grid,
	GridItem,
	ExpandableSection,
	Form,
	FormHelperText,
	FormSelect,
	FormSelectOption,
	Label,
	Modal,
	ModalVariant,
	NumberInput,
	SearchInput,
	Spinner,
	Switch,
	Text,
	TextContent,
	TextInput,
	TextList,
	TextListItem,
	TextVariants,
	ToggleGroup,
	ToggleGroupItem,
	Tooltip,
	ValidatedOptions
} from '@patternfly/react-core';
import {
	Select,
	SelectOption,
	SelectVariant
} from '@patternfly/react-core/deprecated';
import {
    expandable
} from '@patternfly/react-table';
import {
    ExclamationCircleIcon,
    ExclamationTriangleIcon,
    InfoCircleIcon,
    LockIcon,
} from '@patternfly/react-icons';
import PropTypes from "prop-types";
import {
    getSearchEntries, getBaseLevelEntryAttributes,
} from './lib/utils.jsx';
import { ENTRY_MENU } from './lib/constants.jsx';
import EditorTableView from './tableView.jsx';
import { log_cmd, valid_dn } from '../tools.jsx';
import GenericWizard from './wizards/genericWizard.jsx';

const _ = cockpit.gettext;

export class SearchDatabase extends React.Component {
    constructor (props) {
        super(props);

        this.state = {
            searching: false,
            loading: false,
            searchBase: "",
            searchFilter: "",
            searchScope: "sub",
            sizeLimit: 2000,
            timeLimit: 30,
            isExpanded: false,
            searchSuffix: "",
            baseDN: "",
            searchType: 'Search Text',
            searchText: "",
            getOperationalAttrs: false,
            total: 0,
            // Search attributes
            cn: true,
            uid: true,
            sn: true,
            givenName: true,
            mail: true,
            displayName: false,
            legalName: false,
            memberOf: false,
            member: false,
            uniqueMember: false,
            customSearchAttrs: [],
            isCustomAttrOpen: false,
            isConfirmModalOpen: false,
            checkIfLocked: false,
            // Table
            columns: [
                {
                    title: _("Entry DN"),
                    cellFormatters: [expandable]
                },
                {
                    title: _("Child Entries")
                },
                {
                    title: _("Last Modified")
                }
            ],
            rows: [],
            page: 0,
            perPage: 10,
            pagedRows: [],
            wizardName: '',
            isWizardOpen: false,
            wizardEntryDn: '',
            treeViewRootSuffixes: [], // TODO when aci's are ready (is there a better list of suffixes?)
        };

        this.initialResultText = _("Loading ...");

        this.handleChangeSwitch = (_event, checkIfLocked) => {
            this.setState({
                checkIfLocked
            });
        };

        this.handleToggle = (_event, isExpanded) => {
            this.setState({
                isExpanded
            });
        };

        this.toggleOpenWizard = () => {
            this.setState({
                isWizardOpen: !this.state.isWizardOpen
            });
        };

        // Set the operation type and the result code
        this.setWizardOperationInfo = (opInfo) => {
            // typeAndResult is an object with two fields (opType and result)
            // eg: {operationType: 'MODRDN', resultCode: 0, time: 1613090160492}
            const wizardOperationInfo = { ...opInfo };
            this.setState({ wizardOperationInfo });
        };

        // Custom filter attributes
        this.handleCustomAttrToggle = (_event, isCustomAttrOpen) => {
            this.setState({
                isCustomAttrOpen,
            });
        };
        this.handleCustomAttrClear = () => {
            this.setState({
                customSearchAttrs: [],
                isCustomAttrOpen: false
            });
        };

        this.handleCustomAttrChange = (event, selection) => {
            const { customSearchAttrs } = this.state;
            if (customSearchAttrs.includes(selection)) {
                this.setState(
                    prevState => ({
                        customSearchAttrs: prevState.customSearchAttrs.filter(item => item !== selection),
                        isCustomAttrOpen: false
                    }), () => { this.buildSearchFilter(this.state.searchText) }
                );
            } else {
                this.setState(
                    prevState => ({
                        customSearchAttrs: [...prevState.customSearchAttrs, selection],
                        isCustomAttrOpen: false,
                    }), () => { this.buildSearchFilter(this.state.searchText) }
                );
            }
        };

        this.buildSearchFilter = (value) => {
            let searchFilter = "";
            if (this.state.searchType === "Search Text") {
                // Build filter from attributes
                //
                // (|(attr1=*VALUE*)(attr2=*VALUE*)...)
                let attrs = [];
                const chkBoxAttrs = [
                    'cn', 'uid', 'sn', 'givenName', 'mail', 'displayName',
                    'legalName', 'memberOf', 'member', 'uniqueMember'
                ];
                for (const attr of chkBoxAttrs) {
                    if (this.state[attr]) {
                        attrs.push(attr);
                    }
                }
                attrs = attrs.concat(this.state.customSearchAttrs);
                if (attrs.length === 0) {
                    return;
                }
                if (attrs.length > 1) {
                    searchFilter = "(|";
                    for (const attr of attrs) {
                        searchFilter += "(" + attr + "=*" + value + "*)";
                    }
                    searchFilter += ")";
                } else {
                    searchFilter = "(" + attrs[0] + "=*" + value + "*)";
                }
            } else {
                // Value is the LDAP search filter
                searchFilter = value;
            }
            return searchFilter;
        };

        this.handleSearchChange = (event, value) => {
            this.setState({
                searchText: value,
                searchFilter: this.buildSearchFilter(value),
            });
        };

        this.handleSearch = () => {
            if (!this.state.searchFilter) {
                return;
            }
            // Do search
            this.setState({
                rows: [],
                isExpanded: false,
                searching: true,
            }, () => {
                const params = {
                    serverId: this.props.serverId,
                    searchBase: this.state.searchBase,
                    searchFilter: this.state.searchFilter,
                    searchScope: this.state.searchScope,
                    sizeLimit: this.state.sizeLimit,
                    timeLimit: this.state.timeLimit,
                    addNotification: this.props.addNotification,
                };
                getSearchEntries(params, this.processResults);
            });
        };

        this.handleSearchTypeClick = (event, isSelected) => {
            const id = event.currentTarget.id;
            this.setState({
                searchType: id,
                searchText: "",
                searchFilter: "",
            });
        };

        this.handleScopeClick = (event, isSelected) => {
            const id = event.currentTarget.id;
            this.setState({ searchScope: id });
        };

        this.maxValue = 20000000;
        this.onMinus = (id) => {
            this.setState({
                [id]: Number(this.state[id]) - 1
            });
        };
        this.onNumberChange = (event, id, min) => {
            const newValue = isNaN(event.target.value) ? 0 : Number(event.target.value);
            this.setState({
                [id]: newValue > this.maxValue ? this.maxValue : newValue < min ? min : newValue
            });
        };
        this.onPlus = (id) => {
            this.setState({
                [id]: Number(this.state[id]) + 1
            });
        };

        this.handleClearSearchBase = () => {
            this.setState({
                searchBase: this.state.searchSuffix
            });
        };

        this.handleConfirmModalToggle = () => {
            this.setState(({ isConfirmModalOpen }) => ({
                isConfirmModalOpen: !isConfirmModalOpen,
            }));
        };

        this.handleChange = this.handleChange.bind(this);
        this.handleSuffixChange = this.handleSuffixChange.bind(this);
        this.handleCustomAttrChange = this.handleCustomAttrChange.bind(this);
        this.getPageData = this.getPageData.bind(this);
        this.processResults = this.processResults.bind(this);
        this.handleCollapse = this.handleCollapse.bind(this);
        this.actionResolver = this.actionResolver.bind(this);
        this.handleLockUnlockEntry = this.handleLockUnlockEntry.bind(this);
    }

    componentDidMount() {
        const suffixList = this.props.suffixList;
        const searchBase = this.props.searchBase;
        let baseDN = searchBase; // Drop down list of selected suffix
        for (const suffix of suffixList) {
            if (baseDN.includes(suffix)) {
                baseDN = suffix;
                break;
            }
        }
        this.setState({
            searchBase: searchBase || (suffixList.length > 0 ? suffixList[0] : ""),
            searchSuffix: this.props.suffixList.length > 0 ? this.props.suffixList[0] : "",
            baseDN
        });
    }

    handleCollapse (event, rowKey, isOpen, data) {
        const { pagedRows } = this.state;
        pagedRows[rowKey].isOpen = isOpen;
        this.setState({
            pagedRows
        });

        const firstTime = (pagedRows[rowKey + 1].cells[0].title) === this.initialResultText;
        if (firstTime) {
            const baseDn = pagedRows[rowKey].rawdn; // The DN is the first element in the array.
            getBaseLevelEntryAttributes(this.props.serverId, baseDn, (entryArray) => {
                pagedRows[rowKey + 1].cells = [{
                    title: (
                        <>
                            {entryArray.map((line) => (
                                <div key={line.attribute + line.value}>
                                    <strong>{line.attribute}</strong>
                                    {line.value.toLowerCase() === ": ldapsubentry"
                                        ? <span className="ds-info-color">{line.value}</span>
                                        : line.attribute.toLowerCase() === "userpassword"
                                            ? ": ********"
                                            : line.attribute.toLowerCase() === "jpegphoto"
                                                ? (
                                                    <div>
                                                        <img
                                                            src={`data:image/png;base64,${line.value.substr(3)}`} // strip ':: '
                                                            alt=''
                                                            style={{ width: '256px' }}
                                                        />
                                                    </div>
                                                )
                                                : line.value}
                                </div>
                            ))}
                        </>
                    )
                }];
                // Update the row.
                this.setState({
                    pagedRows
                });
            });
        }
    }

    // Process the entries that are direct children.
    processResults = (searchResults, resObj) => {
        let resultRows = [];
        let rowNumber = 0;

        if (searchResults) {
            if (this.state.checkIfLocked) {
                searchResults.map(aChild => {
                    const info = JSON.parse(aChild);
                    resultRows = [...this.state.rows];
                    let entryState = "";
                    let entryStateIcon = "";

                    entryStateIcon = <LockIcon className="ds-pf-blue-color" />;
                    const cmd = ["dsidm", "-j", "ldapi://%2fvar%2frun%2fslapd-" + this.props.serverId + ".socket",
                        "-b", info.dn, info.isRole ? "role" : "account", "entry-status", info.dn];
                    log_cmd("processResults", "Checking if entry is activated", cmd);
                    cockpit
                            .spawn(cmd, { superuser: true, err: 'message' })
                            .done(content => {
                                if (info.isLockable) {
                                    const status = JSON.parse(content);
                                    entryState = status.info.state;
                                    if (entryState === 'inactivity limit exceeded' || entryState.startsWith("probably activated or")) {
                                        entryStateIcon = <ExclamationTriangleIcon className="ds-pf-yellow-color ct-icon-exclamation-triangle" />;
                                    }
                                }
                            })
                            .fail(err => {
                                const errMsg = JSON.parse(err);
                                if ((info.isLockable) && !(errMsg.desc.includes("Root suffix can't be locked or unlocked"))) {
                                    console.error(
                                        "processResults",
                                        `${info.isRole ? "role" : "account"} account entry-status operation failed`,
                                        errMsg.desc
                                    );
                                    entryState = "error: please, check browser logs";
                                    entryStateIcon = <ExclamationCircleIcon className="ds-pf-red-color ct-exclamation-circle" />;
                                }
                            })
                            .finally(() => {
                            // TODO Test for a JPEG photo!!!
                                if (!info.isLockable) {
                                    console.info("processResults:", `${info.dn} entry is not lockable`);
                                }

                                let ldapsubentryIcon = "";
                                let entryStateIconFinal = "";
                                if (info.ldapsubentry) {
                                    ldapsubentryIcon = <InfoCircleIcon title={_("This is a hidden LDAP subentry")} className="ds-pf-blue-color ds-info-icon" />;
                                }
                                if ((entryState !== "") && (entryStateIcon !== "") && (entryState !== "activated")) {
                                    entryStateIconFinal = (
                                        <Tooltip
                                    position="bottom"
                                    content={
                                        <div className="ds-info-icon">
                                            {entryState}
                                        </div>
                                    }
                                        >
                                            <a className="ds-font-size-md">{entryStateIcon}</a>
                                        </Tooltip>
                                    );
                                }

                                const dn = (
                                    <>
                                        {info.dn} {ldapsubentryIcon} {entryStateIconFinal}
                                    </>
                                );

                                resultRows.push(
                                    {
                                        isOpen: false,
                                        cells: [
                                            { title: dn },
                                            info.numSubordinates,
                                            info.modifyTimestamp,
                                        ],
                                        rawdn: info.dn,
                                        isLockable: info.isLockable,
                                        isRole: info.isRole,
                                        entryState
                                    },
                                    {
                                        parent: rowNumber,
                                        cells: [
                                            { title: this.initialResultText }
                                        ]
                                    });

                                // Increment by 2 the row number.
                                rowNumber += 2;
                                this.setState({
                                    searching: false,
                                    rows: resultRows,
                                    // Each row is composed of a parent and its single child.
                                    pagedRows: resultRows.slice(0, 2 * this.state.perPage),
                                    total: resultRows.length / 2,
                                    page: 1
                                });
                            });
                    return [];
                });
            } else {
                searchResults.map(aChild => {
                    const info = JSON.parse(aChild);
                    // TODO Test for a JPEG photo!!!

                    // TODO Add isActive func
                    let dn = info.dn;
                    if (info.ldapsubentry) {
                        dn = (
                            <div className="ds-info-icon">
                                {info.dn} <InfoCircleIcon title={_("This is a hidden LDAP subentry")} className="ds-info-icon" />
                            </div>
                        );
                    }

                    resultRows.push(
                        {
                            isOpen: false,
                            cells: [
                                { title: dn },
                                info.numSubordinates,
                                info.modifyTimestamp,
                            ],
                            rawdn: info.dn,
                            entryState: ""
                        },
                        {
                            parent: rowNumber,
                            cells: [
                                { title: this.initialResultText }
                            ]
                        });

                    // Increment by 2 the row number.
                    rowNumber += 2;
                    return [];
                });
                this.setState({
                    searching: false,
                    rows: resultRows,
                    // Each row is composed of a parent and its single child.
                    pagedRows: resultRows.slice(0, 2 * this.state.perPage),
                    total: resultRows.length / 2,
                    page: 1
                });
            }
        } else {
            if (resObj.status !== 0) {
                this.props.addNotification(
                    "error",
                    cockpit.format(_("Error searching the database: $0"), resObj.msg)
                );
            }
            this.setState({
                searching: false,
                rows: resultRows,
                // Each row is composed of a parent and its single child.
                pagedRows: resultRows.slice(0, 2 * this.state.perPage),
                total: resultRows.length / 2,
                page: 1
            });
        }
    };

    handleCustomAttrChange (value) {
        this.setState({
            customSearchAttrs: value
        });
    }

    handleSuffixChange (e) {
        const value = e.target.value;
        this.setState({
            searchSuffix: value,
            searchBase: value,
            baseDN: value,
        });
    }

    handleChange (e, _str) {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value.trim();
        this.setState({
            [e.target.id]: value,
        }, () => {
            this.setState({
                searchFilter: this.buildSearchFilter(this.state.searchText),
            });
        });
    }

    getPageData (page, perPage) {
        if (page === 1) {
            const pagedRows = this.state.rows.slice(0, 2 * perPage); // Each parent has a single child.
            this.setState({ pagedRows, perPage, page, loading: false });
        } else {
            // Need the double since each parent has a single child.
            const start = 2 * (page - 1) * perPage;
            const end = 2 * page * perPage;
            const pagedRows = this.state.rows.slice(start, end);
            for (let i = 0; i < pagedRows.length - 1; i++) {
                if (i % 2 === 0) {
                    pagedRows[i + 1].parent = i;
                }
            }
            this.setState({ pagedRows, perPage, page, loading: false });
        }
    }

    handleLockUnlockEntry() {
        const {
            entryDn,
            entryType,
            operationType
        } = this.state;

        const cmd = ["dsidm", "-j", "ldapi://%2fvar%2frun%2fslapd-" + this.props.serverId + ".socket",
            "-b", entryDn, entryType, operationType, entryDn];
        log_cmd("handleLockUnlockEntry", `${operationType} entry`, cmd);
        cockpit
                .spawn(cmd, { superuser: true, err: 'message' })
                .done(_ => {
                    this.setState({
                        entryMenuIsOpen: !this.state.entryMenuIsOpen,
                        refreshEntryTime: Date.now()
                    }, () => {
                        this.handleSearch();
                        this.handleConfirmModalToggle();
                    });
                })
                .fail(err => {
                    const errMsg = JSON.parse(err);
                    console.error(
                        "handleLockUnlockEntry",
                        `${entryType} ${operationType} operation failed -`,
                        errMsg.desc
                    );
                    this.props.addNotification(
                        `${errMsg.desc.includes(`is already ${operationType === "unlock" ? "active" : "locked"}`) ? 'warning' : 'error'}`,
                        `${errMsg.desc}`
                    );
                    this.setState({
                        entryMenuIsOpen: !this.state.entryMenuIsOpen,
                        refreshEntryTime: Date.now()
                    }, () => {
                        this.handleSearch();
                        this.handleConfirmModalToggle();
                    });
                });
    }

    actionResolver = (rowData, { rowIndex }) => {
        // No action on the children.
        if ((rowIndex % 2) === 1) {
            return null;
        }

        let lockingDropdown = [];
        if (rowData.entryState !== "" && !rowData.entryState.startsWith("error:")) {
            if (rowData.entryState !== "activated") {
                if (rowData.entryState.includes("probably activated") || rowData.entryState.includes("indirectly locked")) {
                    lockingDropdown = [{
                        title: _("Lock ..."),
                        onClick:
                        () => {
                            const entryType = rowData.isRole ? "role" : "account";
                            this.setState({
                                entryDn: rowData.rawdn,
                                entryType,
                                operationType: "lock"
                            }, () => { this.handleConfirmModalToggle() });
                        }
                    }];
                } else {
                    lockingDropdown = [{
                        title: _("Unlock ..."),
                        onClick:
                        () => {
                            const entryType = rowData.isRole ? "role" : "account";
                            this.setState({
                                entryDn: rowData.rawdn,
                                entryType,
                                operationType: "unlock"
                            }, () => { this.handleConfirmModalToggle() });
                        }
                    }];
                }
            } else {
                lockingDropdown = [{
                    title: _("Lock ..."),
                    onClick:
                    () => {
                        const entryType = rowData.isRole ? "role" : "account";
                        this.setState({
                            entryDn: rowData.rawdn,
                            entryType,
                            operationType: "lock"
                        }, () => { this.handleConfirmModalToggle() });
                    }
                }];
            }
        }
        const updateActions =
            [{
                title: _("Search ..."),
                onClick:
                () => {
                    this.setState({
                        activeTabKey: 2,
                        searchBase: rowData.rawdn
                    });
                }
            },
            {
                title: _("Edit ..."),
                onClick:
                () => {
                    this.setState({
                        wizardName: ENTRY_MENU.edit,
                        wizardEntryDn: rowData.rawdn,
                        isWizardOpen: true
                    });
                }
            },
            {
                title: _("New ..."),
                onClick:
                () => {
                    this.setState({
                        wizardName: ENTRY_MENU.new,
                        wizardEntryDn: rowData.rawdn,
                        isWizardOpen: true
                    });
                }
            },
            ...lockingDropdown,
            {
                isSeparator: true
            },
            {
                title: _("ACIs ..."),
                onClick:
                () => {
                    this.setState({
                        wizardName: ENTRY_MENU.acis,
                        wizardEntryDn: rowData.rawdn,
                        isWizardOpen: true
                    });
                }
            },
            {
                title: _("Class of Service ..."),
                onClick:
                () => {
                    this.setState({
                        wizardName: ENTRY_MENU.cos,
                        wizardEntryDn: rowData.rawdn,
                        isWizardOpen: true,
                        isTreeWizardOpen: false,
                    });
                }
            },
            {
                isSeparator: true
            },
            {
                title: _("Delete"),
                onClick:
                () => {
                    this.setState({
                        wizardName: ENTRY_MENU.delete,
                        wizardEntryDn: rowData.rawdn,
                        isWizardOpen: true
                    });
                }
            }];

        return [
            ...updateActions,
        ];
    };

    render() {
        const {
            suffixList
        } = this.props;

        const {
            baseDN,
            page,
            perPage,
            total,
            searching,
            wizardName,
            isWizardOpen,
            wizardEntryDn,
        } = this.state;

        let columns = this.state.columns;
        let pagedRows = this.state.pagedRows;

        if (pagedRows.length === 0) {
            columns = [' '];
            pagedRows = [{ cells: [_("No Search Results")] }];
        }

        const treeItemsProps = wizardName === 'acis'
            ? { treeViewRootSuffixes: this.state.treeViewRootSuffixes }
            : {};

        return (
            <div>
                {isWizardOpen && (
                    <GenericWizard
                        wizardName={wizardName}
                        isWizardOpen={isWizardOpen}
                        toggleOpenWizard={this.toggleOpenWizard}
                        wizardEntryDn={wizardEntryDn}
                        editorLdapServer={this.props.serverId}
                        {...treeItemsProps}
                        setWizardOperationInfo={this.setWizardOperationInfo}
                        onReload={this.handleSearch}
                        allObjectclasses={this.props.allObjectclasses}
                    />
                )}
                <Form className="ds-margin-top-lg" isHorizontal autoComplete="off">
                    <Grid className="ds-margin-left">
                        <div className="ds-container">
                            <TextContent>
                                <Text component={TextVariants.h3}>
                                    {_("Search Database")}
                                </Text>
                            </TextContent>
                            <Grid className="ds-left-margin">
                                <GridItem span={4}>
                                    <FormSelect
                                        id="searchSuffix"
                                        value={baseDN}
                                        onChange={(event, value) => {
                                            this.handleSuffixChange(event);
                                        }}
                                        aria-label="FormSelect Input"
                                        className="ds-instance-select ds-raise-field"
                                        isDisabled={suffixList.length === 0}
                                    >
                                        {suffixList.map((suffix, index) => (
                                            <FormSelectOption key={suffix} value={suffix} label={suffix} />
                                        ))}
                                        {suffixList.length === 0 &&
                                            <FormSelectOption isDisabled key="No database" value="" label={_("No databases")} />}
                                    </FormSelect>
                                </GridItem>
                                <GridItem span={8}>
                                    { this.state.searchSuffix !== this.state.searchBase ? <Label onClose={this.handleClearSearchBase} className="ds-left-margin" color="blue">{this.state.searchBase}</Label> : "" }
                                </GridItem>
                            </Grid>
                        </div>
                    </Grid>
                    <Grid className="ds-margin-left">
                        <GridItem span={12}>
                            <div className="ds-container">
                                <ToggleGroup aria-label="Default with single selectable">
                                    <ToggleGroupItem
                                        title={_("Text that will be used with pre-selected attributes to find matching entries.")}
                                        text={_("Text")}
                                        buttonId="Search Text"
                                        isSelected={this.state.searchType === "Search Text"}
                                        onChange={(event, isSelected) => this.handleSearchTypeClick(event, isSelected)}
                                    />
                                    <ToggleGroupItem
                                        title={_("Specific LDAP search filter for finding entries.")}
                                        text={_("Filter")}
                                        buttonId="Search Filter"
                                        isSelected={this.state.searchType === "Search Filter"}
                                        onChange={(event, isSelected) => this.handleSearchTypeClick(event, isSelected)}
                                    />
                                </ToggleGroup>
                                <SearchInput
                                    placeholder={this.state.searchType === "Search Text" ? _("Enter search text ...") : _("Enter an LDAP search filter ...")}
                                    value={this.state.searchText}
                                    onChange={(evt, val) => this.handleSearchChange(evt, val)}
                                    onClear={(evt, val) => this.handleSearchChange(evt, '')}
                                    onSearch={this.handleSearch}
                                    className="ds-search-input"
                                />
                            </div>
                        </GridItem>
                    </Grid>

                    <ExpandableSection
                        className="ds-margin-left"
                        toggleText={this.state.isExpanded ? _("Hide Search Criteria") : _("Show Search Criteria")}
                        onToggle={(event, isExpanded) => this.handleToggle(event, isExpanded)}
                        isExpanded={this.state.isExpanded}
                        displaySize={this.state.isExpanded ? "large" : "default"}
                    >
                        <Grid className="ds-margin-left">
                            <GridItem span={2} className="ds-label">
                                {_("Search Base")}
                            </GridItem>
                            <GridItem span={6}>
                                <TextInput
                                    value={this.state.searchBase}
                                    type="text"
                                    id="searchBase"
                                    aria-describedby="searchBase"
                                    name={_("searchBase")}
                                    onChange={(e, str) => {
                                        this.handleChange(e);
                                    }}
                                    validated={!valid_dn(this.state.searchBase) ? ValidatedOptions.error : ValidatedOptions.default}
                                />
                            </GridItem>
                            <GridItem span={2} className="ds-left-margin ds-lower-field-md">
                                <FormHelperText  >
                                    {_("Invalid DN syntax")}
                                </FormHelperText>
                            </GridItem>

                        </Grid>
                        <Grid className="ds-margin-left ds-margin-top">
                            <GridItem span={2} className="ds-label">
                                {_("Search Scope")}
                            </GridItem>
                            <GridItem span={4}>
                                <ToggleGroup aria-label="search scope">
                                    <ToggleGroupItem
                                        text={_("Subtree")}
                                        buttonId="sub"
                                        isSelected={this.state.searchScope === "sub"}
                                        onChange={(evt, val) => this.handleScopeClick(evt, val)}
                                        title={_("Search for entries starting at the search base, and including all its child entries")}
                                    />
                                    <ToggleGroupItem
                                        text={_("One Level")}
                                        buttonId="one"
                                        isSelected={this.state.searchScope === "one"}
                                        onChange={(evt, val) => this.handleScopeClick(evt, val)}
                                        title={_("Search for entries starting at the search base, and include only the first level of child entries")}
                                    />
                                    <ToggleGroupItem
                                        text={_("Base")}
                                        buttonId="base"
                                        isSelected={this.state.searchScope === "base"}
                                        onChange={(evt, val) => this.handleScopeClick(evt, val)}
                                        title={_("Search for an exact entry (search base). This does not include child entries.")}
                                    />
                                </ToggleGroup>
                            </GridItem>
                        </Grid>
                        <Grid className="ds-margin-left ds-margin-top">
                            <GridItem span={2} className="ds-label">
                                {_("Size Limit")}
                            </GridItem>
                            <GridItem span={10}>
                                <NumberInput
                                    value={this.state.sizeLimit}
                                    min={-1}
                                    max={this.maxValue}
                                    onMinus={() => { this.onMinus("sizeLimit") }}
                                    onChange={(e) => { this.onNumberChange(e, "sizeLimit", -1) }}
                                    onPlus={() => { this.onPlus("sizeLimit") }}
                                    inputName="input"
                                    inputAriaLabel="number input"
                                    minusBtnAriaLabel="minus"
                                    plusBtnAriaLabel="plus"
                                    widthChars={8}
                                />
                            </GridItem>
                        </Grid>
                        <Grid className="ds-margin-left ds-margin-top" title={_("Search timeout in seconds")}>
                            <GridItem span={2} className="ds-label">
                                {_("Time Limit")}
                            </GridItem>
                            <GridItem span={10}>
                                <NumberInput
                                    value={this.state.timeLimit}
                                    min={-1}
                                    max={this.maxValue}
                                    onMinus={() => { this.onMinus("timeLimit") }}
                                    onChange={(e) => { this.onNumberChange(e, "timeLimit", -1) }}
                                    onPlus={() => { this.onPlus("timeLimit") }}
                                    inputName="input"
                                    inputAriaLabel="number input"
                                    minusBtnAriaLabel="minus"
                                    plusBtnAriaLabel="plus"
                                    widthChars={8}
                                />
                            </GridItem>
                        </Grid>
                        <Grid className="ds-margin-left ds-margin-top" title={_("Check if the search result entries are locked, and add Lock/Unlock options to the dropdown. This setting vastly impacts the search's performance. Use only when needed.")}>
                            <GridItem span={2} className="ds-label">
                                {_("Show Locking")}
                            </GridItem>
                            <GridItem span={10}>
                                <Switch id="no-label-switch-on" aria-label="Message when on" isChecked={this.state.checkIfLocked} onChange={(event, val) => this.handleChangeSwitch(event, val)} />
                            </GridItem>
                        </Grid>
                        <div hidden={this.state.searchType === "Search Filter"}>
                            <Grid
                                className="ds-margin-left ds-margin-top"
                                title={_("Only used for Search Text based queries.  The selected attributes will use Search Text as the attribute value in the search filter")}
                            >
                                <GridItem span={2} className="ds-label">
                                    {_("Search Attributes")}
                                </GridItem>
                            </Grid>
                            <div className="ds-indent">
                                <Grid className="ds-margin-left ds-margin-top">
                                    <GridItem span={3}>
                                        <Checkbox
                                            label={_("cn")}
                                            id="cn"
                                            isChecked={this.state.cn}
                                            onChange={(e, checked) => {
                                                this.handleChange(e);
                                            }}
                                            aria-label="cn"
                                        />
                                    </GridItem>
                                    <GridItem span={3}>
                                        <Checkbox
                                            label={_("uid")}
                                            id="uid"
                                            isChecked={this.state.uid}
                                            onChange={(e, checked) => {
                                                this.handleChange(e);
                                            }}
                                            aria-label="uid"
                                        />
                                    </GridItem>
                                    <GridItem span={3}>
                                        <Checkbox
                                            label={_("sn")}
                                            id="sn"
                                            isChecked={this.state.sn}
                                            onChange={(e, checked) => {
                                                this.handleChange(e);
                                            }}
                                            aria-label="sn"
                                        />
                                    </GridItem>
                                </Grid>
                                <Grid className="ds-margin-left ds-margin-top">
                                    <GridItem span={3}>
                                        <Checkbox
                                            label={_("givenName")}
                                            id="givenName"
                                            isChecked={this.state.givenName}
                                            onChange={(e, checked) => {
                                                this.handleChange(e);
                                            }}
                                            aria-label="givenName"
                                        />
                                    </GridItem>
                                    <GridItem span={3}>
                                        <Checkbox
                                            label={_("mail")}
                                            id="mail"
                                            isChecked={this.state.mail}
                                            onChange={(e, checked) => {
                                                this.handleChange(e);
                                            }}
                                            aria-label="mail"
                                        />
                                    </GridItem>
                                    <GridItem span={3}>
                                        <Checkbox
                                            label={_("displayName")}
                                            id="displayName"
                                            isChecked={this.state.displayName}
                                            onChange={(e, checked) => {
                                                this.handleChange(e);
                                            }}
                                            aria-label="displayName"
                                        />
                                    </GridItem>
                                </Grid>
                                <Grid className="ds-margin-left ds-margin-top">
                                    <GridItem span={3}>
                                        <Checkbox
                                            label={_("legalName")}
                                            id="legalName"
                                            isChecked={this.state.legalName}
                                            onChange={(e, checked) => {
                                                this.handleChange(e);
                                            }}
                                            aria-label="legalName"
                                        />
                                    </GridItem>
                                    <GridItem span={3}>
                                        <Checkbox
                                            label={_("memberOf")}
                                            id="memberOf"
                                            isChecked={this.state.memberOf}
                                            onChange={(e, checked) => {
                                                this.handleChange(e);
                                            }}
                                            aria-label="memberOf"
                                        />
                                    </GridItem>
                                    <GridItem span={3}>
                                        <Checkbox
                                            label={_("member")}
                                            id="member"
                                            isChecked={this.state.member}
                                            onChange={(e, checked) => {
                                                this.handleChange(e);
                                            }}
                                            aria-label="member"
                                        />
                                    </GridItem>
                                </Grid>
                                <Grid className="ds-margin-left ds-margin-top">
                                    <GridItem span={3}>
                                        <Checkbox
                                            label={_("uniqueMember")}
                                            id="uniqueMember"
                                            isChecked={this.state.uniqueMember}
                                            onChange={(e, checked) => {
                                                this.handleChange(e);
                                            }}
                                            aria-label="uniqueMember"
                                        />
                                    </GridItem>
                                </Grid>
                                <Grid className="ds-margin-left ds-margin-top" title={_("Enter space or comma separateed list of attributes to search.")}>
                                    <GridItem span={8}>
                                        <Select
                                            variant={SelectVariant.typeaheadMulti}
                                            typeAheadAriaLabel="Type attributes to include in filter ..."
                                            onToggle={(event, isOpen) => this.handleCustomAttrToggle(event, isOpen)}
                                            onSelect={this.handleCustomAttrChange}
                                            onClear={this.handleCustomAttrClear}
                                            selections={this.state.customSearchAttrs}
                                            isOpen={this.state.isCustomAttrOpen}
                                            aria-labelledby="typeAhead-attr-filter"
                                            placeholderText={_("Type attributes to include in the filter ...")}
                                            noResultsFoundText="There are no matching attributes"
                                        >
                                            {this.props.attributes.map((attr, index) => (
                                                <SelectOption
                                                    key={index}
                                                    value={attr}
                                                />
                                            ))}
                                        </Select>
                                    </GridItem>
                                </Grid>
                            </div>
                        </div>
                    </ExpandableSection>
                </Form>
                <div className="ds-indent">
                    <div className={this.state.searching ? "ds-margin-top-lg ds-center" : "ds-hidden"}>
                        <TextContent>
                            <Text component={TextVariants.h3}>
                                {_("Searching")} <i>{this.state.searchBase}</i> ...
                            </Text>
                        </TextContent>
                        <Spinner className="ds-margin-top-lg" size="xl" />
                    </div>
                    <div className={searching ? "ds-hidden" : ""}>
                        <center>
                            <p><b>{_("Results:")}</b> {total}</p>
                        </center>
                        <EditorTableView
                            key={searching}
                            loading={searching}
                            // Pagination
                            itemCount={total}
                            page={page}
                            perPage={perPage}
                            onSetPage={(value) => this.getPageData(value, perPage)}
                            onPerPageSelect={(value) => this.getPageData(1, value)}
                            // Table
                            editorTableRows={pagedRows}
                            onCollapse={this.handleCollapse}
                            columns={columns}
                            actionResolver={pagedRows.length < 2 ? null : this.actionResolver}
                        />
                    </div>
                </div>
                <Modal
                    // TODO: Fix confirmation modal formatting and size; add operation to the tables
                    variant={ModalVariant.medium}
                    title={
                        cockpit.format(_("Are you sure you want to $0 the $1?"), this.state.operationType, this.state.entryTyp)
                    }
                    isOpen={this.state.isConfirmModalOpen}
                    onClose={this.handleConfirmModalToggle}
                    actions={[
                        <Button key="confirm" variant="primary" onClick={this.handleLockUnlockEntry}>
                            {_("Confirm")}
                        </Button>,
                        <Button key="cancel" variant="link" onClick={this.handleConfirmModalToggle}>
                            {_("Cancel")}
                        </Button>
                    ]}
                >
                    <TextContent className="ds-margin-top">
                        <Text>
                            {this.state.entryType === "account"
                                ? `It will ${this.state.operationType === "lock" ? "add" : "remove"} nsAccountLock attribute
                            ${this.state.operationType === "lock" ? "to" : "from"} the entry - ${this.state.entryDn}.`
                                : `This operation will make sure that these five entries are created at the entry's root suffix (if not, they will be created):`}
                        </Text>
                        {this.state.entryType === "role" &&
                        <>
                            <TextList>
                                <TextListItem>
                                    cn=nsManagedDisabledRole
                                </TextListItem>
                                <TextListItem>
                                    cn=nsDisabledRole
                                </TextListItem>
                                <TextListItem>
                                    cn=nsAccountInactivationTmp (with a child)
                                </TextListItem>
                                <TextListItem>
                                    cn=nsAccountInactivation_cos
                                </TextListItem>
                            </TextList>
                            <Text>
                                {`The entry - ${this.state.entryDn} - will be ${this.state.operationType === "lock" ? "added to" : "removed from"} nsRoleDN attribute in cn=nsDisabledRole entry in the root suffix.`}
                            </Text>
                        </>}
                    </TextContent>
                </Modal>
            </div>
        );
    }
}

SearchDatabase.propTypes = {
    attributes: PropTypes.array,
    searchBase: PropTypes.string,
};

SearchDatabase.defaultProps = {
    attributes: [],
    searchBase: "",
};
